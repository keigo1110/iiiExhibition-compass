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

type OrientationListener = (event: DeviceOrientationEvent) => void;

interface RawSensorData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  timestamp: number;
}

export function DirectionCompass() {
  const [currentPosition, setCurrentPosition] = useState({ latitude: 0, longitude: 0 })
  const [destination, setDestination] = useState({ latitude: 35.7114, longitude: 139.7611 })
  const [compass, setCompass] = useState(0)
  const [direction, setDirection] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [debug, setDebug] = useState<string>('')
  const [rawSensorData, setRawSensorData] = useState<RawSensorData>({
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    timestamp: 0
  });

  const orientationListenerRef = useRef<OrientationListener | null>(null)
  const debugMessagesRef = useRef<string[]>([]);

  // デバッグメッセージの管理を改善
  const updateDebug = useCallback((message: string) => {
    debugMessagesRef.current = [message];
    setDebug(message);
  }, []);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    try {
      const compassEvent = event as DeviceOrientationEventWithWebkit;
      const now = Date.now();

      // センサーデータを更新
      setRawSensorData({
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        absolute: event.absolute,
        timestamp: now
      });

      // iOS の場合
      if (isIOS && typeof compassEvent.webkitCompassHeading === 'number') {
        const newCompass = compassEvent.webkitCompassHeading;
        setCompass(newCompass);
        updateDebug(`iOS: heading=${newCompass.toFixed(1)}°`);
        setError(null);
        return;
      }

      // Androidの場合
      if (!isIOS && typeof event.alpha === 'number') {
        const alpha = event.alpha;
        const beta = event.beta || 0;
        const gamma = event.gamma || 0;

        // デバイスの傾きチェックを緩和
        if (Math.abs(beta) > 70 || Math.abs(gamma) > 70) {
          setError('デバイスを水平に近づけてください');
          return;
        }

        // 画面の向きに基づく補正を改善
        let heading = alpha;
        const screenAngle = window.screen.orientation?.angle || 0;
        heading = (360 - ((heading + screenAngle) % 360)) % 360;

        setCompass(heading);
        updateDebug(
          `Android: α=${alpha.toFixed(1)}° ` +
          `screen=${screenAngle}° ` +
          `heading=${heading.toFixed(1)}°`
        );
        setError(null);
      }
    } catch (error) {
      console.error('Orientation error:', error);
      setError('方位の取得中にエラーが発生しました');
    }
  }, [isIOS, updateDebug]);

  const removeOrientationListener = useCallback(() => {
    if (orientationListenerRef.current) {
      window.removeEventListener('deviceorientationabsolute', orientationListenerRef.current);
      window.removeEventListener('deviceorientation', orientationListenerRef.current);
      orientationListenerRef.current = null;
    }
  }, []);

  const initializeCompass = useCallback(() => {
    removeOrientationListener();

    const listener: OrientationListener = (event: DeviceOrientationEvent) => {
      handleOrientation(event);
    };

    orientationListenerRef.current = listener;

    try {
      if (!isIOS && 'ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', listener);
        updateDebug('Using deviceorientationabsolute');
      } else {
        window.addEventListener('deviceorientation', listener);
        updateDebug('Using deviceorientation');
      }
    } catch (error) {
      console.error('Compass initialization error:', error);
      setError('コンパスの初期化に失敗しました');
    }
  }, [handleOrientation, removeOrientationListener, isIOS, updateDebug]);

  const requestDeviceOrientationPermission = async () => {
    try {
      if (isIOS) {
        const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
        if (requestPermission) {
          const response = await requestPermission()
          if (response === 'granted') {
            setPermissionGranted(true)
            initializeCompass()
          } else {
            setError('方位センサーの使用が許可されませんでした。')
          }
        }
      } else {
        setPermissionGranted(true)
        initializeCompass()
      }
    } catch (error) {
      console.error('Permission error:', error);
      if (!isIOS) {
        setPermissionGranted(true)
        initializeCompass()
      }
    }
  };

  const handleDestinationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const [lat, lon] = e.target.value.split(',').map(Number)
      if (!isNaN(lat) && !isNaN(lon)) {
        setDestination({ latitude: lat, longitude: lon })
        setError(null)
      } else {
        setError("無効な座標が入力されました。")
      }
    } catch (error) {
      console.error('Destination input error:', error);
      setError("座標の形式が正しくありません。")
    }
  }, []);

  // iOS/Android検出
  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
  }, []);

  // センサーの状態監視
  useEffect(() => {
    const checkSensorStatus = () => {
      const now = Date.now();
      const timeSinceLastUpdate = now - rawSensorData.timestamp;

      if (timeSinceLastUpdate > 1000 && permissionGranted) {
        updateDebug(`Sensor not responding (${timeSinceLastUpdate}ms since last update)`);
        // センサーが応答しない場合、リスナーを再初期化
        initializeCompass();
      }
    };

    const timeoutId = window.setInterval(checkSensorStatus, 2000);
    return () => window.clearInterval(timeoutId);
  }, [rawSensorData.timestamp, permissionGranted, initializeCompass, updateDebug]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      removeOrientationListener();
    };
  }, [removeOrientationListener]);

  // 位置情報の監視
  useEffect(() => {
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
        console.error('Geolocation error:', positionError);
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

  // 方位計算
  const toRadians = useCallback((degrees: number) => degrees * (Math.PI / 180), []);
  const toDegrees = useCallback((radians: number) => radians * (180 / Math.PI), []);

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
        <div className="space-y-2 text-xs text-gray-500">
          <div>{debug}</div>
          <div>
            Raw Sensor Data:
            <br />
            α: {rawSensorData.alpha?.toFixed(1) ?? 'N/A'}°
            <br />
            β: {rawSensorData.beta?.toFixed(1) ?? 'N/A'}°
            <br />
            γ: {rawSensorData.gamma?.toFixed(1) ?? 'N/A'}°
            <br />
            Absolute: {rawSensorData.absolute ? 'Yes' : 'No'}
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