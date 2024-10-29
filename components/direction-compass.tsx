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

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
  }, [])

  // センサーのデバッグ情報を更新
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - rawSensorData.timestamp;

      if (timeSinceLastUpdate > 1000) {
        setDebug(prev => `${prev}\nSensor not updating! Last update: ${timeSinceLastUpdate}ms ago`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rawSensorData.timestamp]);

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    try {
      const compassEvent = event as DeviceOrientationEventWithWebkit

      // センサーデータが存在することを確認
      if (event.alpha === null && !compassEvent.webkitCompassHeading) {
        setError('方位センサーが利用できません。センサーの有効化を確認してください。');
        return;
      }

      // 生のセンサーデータを保存
      setRawSensorData({
        alpha: event.alpha,
        beta: event.beta,
        gamma: event.gamma,
        absolute: event.absolute,
        timestamp: Date.now()
      });

      // iOS の場合
      if (isIOS && typeof compassEvent.webkitCompassHeading === 'number') {
        const newCompass = compassEvent.webkitCompassHeading;
        setCompass(newCompass);
        setDebug(`iOS: heading=${newCompass.toFixed(1)}°`);
        setError(null);
        return;
      }

      // Androidの場合
      if (!isIOS && typeof event.alpha === 'number') {
        const beta = event.beta || 0;
        const gamma = event.gamma || 0;

        // デバイスの傾きが大きすぎる場合は警告
        if (Math.abs(beta) > 50 || Math.abs(gamma) > 50) {
          setError('デバイスをより水平に保持してください');
          return;
        }

        let heading = event.alpha;

        // 画面の向きを取得
        const screenOrientation = (window.screen.orientation?.angle || 0);

        // 画面の向きに応じた補正
        heading = (heading + screenOrientation) % 360;

        // 方位角への変換（時計回りから反時計回りへ）
        heading = (360 - heading) % 360;

        setCompass(heading);
        setDebug(
          `Android: raw=${event.alpha.toFixed(1)}° ` +
          `screen=${screenOrientation}° ` +
          `corrected=${heading.toFixed(1)}° ` +
          `beta=${beta.toFixed(1)}° ` +
          `gamma=${gamma.toFixed(1)}° ` +
          `absolute=${event.absolute}`
        );
        setError(null);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Orientation handling error:', error);
        setDebug(`Error: ${error.message}`);
      }
      setError('方位の取得中にエラーが発生しました。');
    }
  }, [isIOS]);

  const removeOrientationListener = useCallback(() => {
    if (orientationListenerRef.current) {
      try {
        (window as Window).removeEventListener('deviceorientationabsolute', orientationListenerRef.current);
      } catch (err) {  // errorをerrに変更
        if (err instanceof Error) {
          console.log('deviceorientationabsolute listener removal failed:', err.message);
        }
      }

      try {
        (window as Window).removeEventListener('deviceorientation', orientationListenerRef.current);
      } catch (err) {  // errorをerrに変更
        if (err instanceof Error) {
          console.log('deviceorientation listener removal failed:', err.message);
        }
      }

      orientationListenerRef.current = null;
    }
  }, []);

  const initializeCompass = useCallback(() => {
    try {
      // 既存のリスナーを削除
      removeOrientationListener();

      const listener: OrientationListener = (event: DeviceOrientationEvent) => {
        handleOrientation(event);
      };
      orientationListenerRef.current = listener;

      // まずdeviceorientationabsoluteを試す
      if (typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window) {
        (window as Window).addEventListener('deviceorientationabsolute', listener);
        setDebug('Using deviceorientationabsolute');
      } else {
        // フォールバックとしてdeviceorientationを使用
        (window as Window).addEventListener('deviceorientation', listener);
        setDebug('Using deviceorientation');
      }
    } catch (err) {  // errorをerrに変更
      if (err instanceof Error) {
        console.error('Compass initialization error:', err.message);
        setDebug('Init error: ' + err.message);
      }
      setError('方位センサーの初期化中にエラーが発生しました。');
    }
  }, [handleOrientation, removeOrientationListener]);

  const requestDeviceOrientationPermission = async () => {
    try {
      if (isIOS) {
        // iOS特有のパーミッション要求
        const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
        if (requestPermission) {
          const response = await requestPermission();
          if (response === 'granted') {
            setPermissionGranted(true);
            initializeCompass();
          } else {
            setError('方位センサーの使用が許可されませんでした。');
          }
        } else {
          // 古いiOSデバイスの場合
          setPermissionGranted(true);
          initializeCompass();
        }
      } else {
        // Android用の処理
        if ('permissions' in navigator) {
          try {
            // センサーAPIの権限を確認
            await Promise.all([
              navigator.permissions.query({ name: 'accelerometer' as PermissionName }),
              navigator.permissions.query({ name: 'magnetometer' as PermissionName }),
              navigator.permissions.query({ name: 'gyroscope' as PermissionName })
            ]);
            setPermissionGranted(true);
            initializeCompass();
          } catch {  // パラメータを完全に省略
            // 権限APIがサポートされていない場合は、直接初期化を試みる
            console.warn('Sensor permissions API not supported, trying direct initialization');
            setPermissionGranted(true);
            initializeCompass();
          }
        } else {
          // 権限APIがサポートされていない場合
          setPermissionGranted(true);
          initializeCompass();
        }
      }
    } catch {  // パラメータを完全に省略
      console.error('Permission request error');
      // エラーが発生しても初期化を試みる
      setPermissionGranted(true);
      initializeCompass();
    }
  };

  useEffect(() => {
    return () => {
      removeOrientationListener()
    }
  }, [removeOrientationListener])

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
        setError(null)
      },
      (positionError) => {
        setError('位置情報の取得に失敗しました。')
        console.error('Geolocation error:', positionError)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 3000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const toRadians = useCallback((degrees: number) => degrees * (Math.PI / 180), [])
  const toDegrees = useCallback((radians: number) => radians * (180 / Math.PI), [])

  useEffect(() => {
    const y = Math.sin(toRadians(destination.longitude - currentPosition.longitude))
    const x = Math.cos(toRadians(currentPosition.latitude)) * Math.tan(toRadians(destination.latitude)) -
              Math.sin(toRadians(currentPosition.latitude)) * Math.cos(toRadians(destination.longitude - currentPosition.longitude))

    let bearing = Math.atan2(y, x)
    bearing = toDegrees(bearing)
    bearing = (bearing + 360) % 360

    const relativeDirection = (bearing - compass + 360) % 360
    setDirection(relativeDirection)
  }, [currentPosition, destination, compass, toRadians, toDegrees])

  const handleDestinationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const [lat, lon] = e.target.value.split(',').map(Number)
      if (!isNaN(lat) && !isNaN(lon)) {
        setDestination({ latitude: lat, longitude: lon })
        setError(null)
      } else {
        setError("無効な座標が入力されました。")
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Destination input error:', error.message)
      }
      setError("座標の形式が正しくありません。")
    }
  }, [])

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