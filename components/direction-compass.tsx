'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowUp } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface DeviceOrientationEventWithWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

type OrientationListener = (event: DeviceOrientationEvent | DeviceOrientationEventWithWebkit) => void;

interface RawSensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  timestamp: number;
}

interface Position {
  latitude: number;
  longitude: number;
}

// Updated type definitions for DeviceOrientationEvent
declare global {
  interface Window {
    DeviceOrientationEvent: {
      requestPermission?: () => Promise<PermissionState>;
    };
  }
}

export function DirectionCompass() {
  const [currentPosition, setCurrentPosition] = useState<Position>({ latitude: 0, longitude: 0 })
  const [destination, setDestination] = useState<Position>({ latitude: 35.7114, longitude: 139.7611 })
  const [compass, setCompass] = useState<number>(0)
  const [direction, setDirection] = useState<number>(0)
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isIOS, setIsIOS] = useState<boolean>(false)
  const [debug, setDebug] = useState<string>('')
  const [rawSensorData, setRawSensorData] = useState<RawSensorData>({
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    timestamp: 0
  });

  const orientationListenerRef = useRef<OrientationListener | null>(null)
  const compassFilterRef = useRef<number[]>([])

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - rawSensorData.timestamp;

      if (timeSinceLastUpdate > 1000) {
        setDebug(prev => `${prev}\nセンサーが更新されていません！最後の更新: ${timeSinceLastUpdate}ms前`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rawSensorData.timestamp]);

  const applyCompassFilter = useCallback((newValue: number): number => {
    compassFilterRef.current.push(newValue);
    if (compassFilterRef.current.length > 5) {
      compassFilterRef.current.shift();
    }
    return compassFilterRef.current.reduce((a, b) => a + b, 0) / compassFilterRef.current.length;
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent | DeviceOrientationEventWithWebkit) => {
    try {
      // センサーデータを常に保存（デバッグ用）
      if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
        setRawSensorData({
          alpha: event.alpha,
          beta: event.beta,
          gamma: event.gamma,
          absolute: event.absolute,
          timestamp: Date.now()
        });
      } else {
        setDebug('警告: センサーデータがnullです。デバイスが方位センサーをサポートしており、権限が付与されていることを確認してください。');
      }

      // iOS の場合
      if (isIOS && 'webkitCompassHeading' in event && typeof event.webkitCompassHeading === 'number') {
        const newCompass = event.webkitCompassHeading;
        const filteredCompass = applyCompassFilter(newCompass);
        setCompass(filteredCompass);
        setDebug(`iOS: 方位=${filteredCompass.toFixed(1)}°`);
        setError(null);
        return;
      }

      // Androidの場合
      if (!isIOS && event.alpha !== null) {
        const alpha = event.alpha;
        const beta = event.beta ?? 0;
        const gamma = event.gamma ?? 0;

        if (Math.abs(beta) > 50 || Math.abs(gamma) > 50) {
          setError('デバイスをより水平に保持してください');
        } else {
          setError(null);
        }

        let screenOrientation = 0;
        if (typeof window !== 'undefined' && window.screen && window.screen.orientation) {
          screenOrientation = window.screen.orientation.angle;
        }

        let heading = (360 - alpha) % 360;
        heading = (heading + screenOrientation) % 360;
        const filteredHeading = applyCompassFilter(heading);

        setCompass(filteredHeading);
        setDebug(
          `Android: 生の値=${alpha.toFixed(1)}° ` +
          `画面=${screenOrientation}° ` +
          `補正済み=${filteredHeading.toFixed(1)}° ` +
          `β=${beta.toFixed(1)}° ` +
          `γ=${gamma.toFixed(1)}° ` +
          `絶対値=${event.absolute}`
        );
      } else {
        setError('方位センサーが利用できません。センサーの有効化を確認してください。');
      }
    } catch (error) {
      console.error('方位処理エラー:', error);
      if (error instanceof Error) {
        setDebug(`エラー: ${error.message}`);
      }
      setError('方位の取得中にエラーが発生しました。');
    }
  }, [isIOS, applyCompassFilter]);

  const removeOrientationListener = useCallback(() => {
    if (orientationListenerRef.current && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientationabsolute', orientationListenerRef.current);
      window.removeEventListener('deviceorientation', orientationListenerRef.current);
      orientationListenerRef.current = null;
    }
  }, []);

  const initializeCompass = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      removeOrientationListener();

      const listener: OrientationListener = (event: DeviceOrientationEvent | DeviceOrientationEventWithWebkit) => {
        handleOrientation(event);
      };
      orientationListenerRef.current = listener;

      // Explicitly check if the events are supported
      const hasAbsoluteSupport = 'ondeviceorientationabsolute' in window;
      const hasOrientationSupport = 'ondeviceorientation' in window;

      if (hasAbsoluteSupport) {
        window.addEventListener('deviceorientationabsolute', listener as EventListener);
        setDebug('deviceorientationabsoluteを使用');
      } else if (hasOrientationSupport) {
        window.addEventListener('deviceorientation', listener as EventListener);
        setDebug('deviceorientationを使用');
      } else {
        setError('お使いのデバイスでは方位センサーがサポートされていないようです。');
      }
    } catch (error) {
      console.error('コンパス初期化エラー:', error);
      if (error instanceof Error) {
        setDebug('初期化エラー: ' + error.message);
      }
      setError('方位センサーの初期化中にエラーが発生しました。');
    }
  }, [handleOrientation, removeOrientationListener]);

  const requestDeviceOrientationPermission = async () => {
    try {
      if (isIOS) {
        if (typeof window !== 'undefined' && window.DeviceOrientationEvent?.requestPermission) {
          const response = await window.DeviceOrientationEvent.requestPermission();
          if (response === 'granted') {
            setPermissionGranted(true);
            initializeCompass();
          } else {
            setError('方位センサーの使用が許可されませんでした。');
          }
        } else {
          setPermissionGranted(true);
          initializeCompass();
        }
      } else {
        setPermissionGranted(true);
        initializeCompass();
      }
    } catch (error) {
      console.error('権限要求エラー:', error);
      setError('センサー権限の要求中にエラーが発生しました。');
    }
  };

  useEffect(() => {
    return () => {
      removeOrientationListener();
    }
  }, [removeOrientationListener]);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setError(null);
      },
      (positionError) => {
        setError('位置情報の取得に失敗しました。');
        console.error('位置情報エラー:', positionError);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 3000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const toRadians = useCallback((degrees: number): number => {
    return degrees * (Math.PI / 180);
  }, []);

  const toDegrees = useCallback((radians: number): number => {
    return radians * (180 / Math.PI);
  }, []);

  useEffect(() => {
    const y = Math.sin(toRadians(destination.longitude - currentPosition.longitude));
    const x = Math.cos(toRadians(currentPosition.latitude)) * Math.tan(toRadians(destination.latitude)) -
              Math.sin(toRadians(currentPosition.latitude)) * Math.cos(toRadians(destination.longitude - currentPosition.longitude));

    let bearing = Math.atan2(y, x);
    bearing = toDegrees(bearing);
    bearing = (bearing + 360) % 360;

    const relativeDirection = (bearing - compass + 360) % 360;
    setDirection(relativeDirection);
  }, [currentPosition, destination, compass, toRadians, toDegrees]);

  const handleDestinationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const [lat, lon] = e.target.value.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lon)) {
        setDestination({ latitude: lat, longitude: lon });
        setError(null);
      } else {
        setError("無効な座標が入力されました。");
      }
    } catch (error) {
      console.error('目的地入力エラー:', error);
      setError("座標の形式が正しくありません。");
    }
  }, []);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>方位磁石アプリ</CardTitle>
        <CardDescription>目的地の方向を指し示します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-4 mb-4 text-sm text-red-800 bg-red-100 rounded-lg">
            {error}
          </div>
        )}
        <div className="text-center">
          <ArrowUp
            className="mx-auto text-primary"
            style={{
              transform: `rotate(${direction}deg)`,
              transition: 'transform 0.2s ease-out'
            }}
            size={100}
          />
        </div>
        <div>
          <Label htmlFor="destination">目的地（緯度,経度）:</Label>
          <Input
            id="destination"
            type="text"
            placeholder="35.7114,139.7611"
            onChange={handleDestinationChange}
            defaultValue={`${destination.latitude},${destination.longitude}`}
          />
        </div>
        {!permissionGranted && (
          <Button onClick={requestDeviceOrientationPermission}>
            デバイスの向きを許可
          </Button>
        )}
        <div className="space-y-2 text-xs text-gray-500 break-all">
          <div>{debug}</div>
          <div>
            生のセンサーデータ:
            <br />
            α: {rawSensorData.alpha !== null ? rawSensorData.alpha.toFixed(1) : 'N/A'}°
            <br />
            β: {rawSensorData.beta !== null ? rawSensorData.beta.toFixed(1) : 'N/A'}°
            <br />
            γ: {rawSensorData.gamma !== null ? rawSensorData.gamma.toFixed(1) : 'N/A'}°
            <br />
            絶対値: {rawSensorData.absolute ? 'はい' : 'いいえ'}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div>現在位置: {currentPosition.latitude.toFixed(4)}, {currentPosition.longitude.toFixed(4)}</div>
        <div>方向: {Math.round(direction)}°</div>
        <div>コンパス: {Math.round(compass)}°</div>
      </CardFooter>
    </Card>
  );
}