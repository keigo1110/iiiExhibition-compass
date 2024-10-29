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

export function DirectionCompass() {
  const [currentPosition, setCurrentPosition] = useState({ latitude: 0, longitude: 0 })
  const [destination, setDestination] = useState({ latitude: 35.7114, longitude: 139.7611 })
  const [compass, setCompass] = useState(0)
  const [direction, setDirection] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [debug, setDebug] = useState<string>('')

  const orientationListenerRef = useRef<OrientationListener | null>(null)

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
  }, [])

  // センサーイベントのハンドラー
  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    try {
      const compassEvent = event as DeviceOrientationEventWithWebkit

      if (isIOS && typeof compassEvent.webkitCompassHeading === 'number') {
        setCompass(compassEvent.webkitCompassHeading)
        setDebug(`iOS: webkitCompassHeading=${compassEvent.webkitCompassHeading}`)
        setError(null)
        return
      }

      // Androidの場合の処理
      if (event.alpha !== null) {
        let heading = event.alpha;
        const beta = event.beta;
        const gamma = event.gamma;

        // デバッグ情報を更新
        setDebug(`Android: alpha=${heading.toFixed(1)}, beta=${beta?.toFixed(1)}, gamma=${gamma?.toFixed(1)}`)

        // デバイスが傾いている場合の補正
        if (typeof beta === 'number' && typeof gamma === 'number') {
          if (beta > 40 || beta < -40 || gamma > 40 || gamma < -40) {
            setError('デバイスを水平に保持してください')
            return
          }
        }

        // 画面の向きに応じた補正
        if (window.screen.orientation) {
          const screenOrientation = window.screen.orientation.angle || 0
          switch (screenOrientation) {
            case 0:   // ポートレート
              heading = heading
              break
            case 90:  // 左回転
              heading = heading + 90
              break
            case -90: // 右回転
              heading = heading - 90
              break
            case 180: // 上下逆
              heading = heading + 180
              break
          }
          heading = (heading + 360) % 360
        }

        // コンパスの値を設定（北が0度になるように調整）
        heading = (360 - heading) % 360
        setCompass(heading)
        setError(null)
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Orientation handling error:', error.message)
        setDebug(`Error: ${error.message}`)
      }
      setError('方位の取得中にエラーが発生しました。')
    }
  }, [isIOS])

  // イベントリスナーの削除
  const removeOrientationListener = useCallback(() => {
    if (orientationListenerRef.current) {
      try {
        window.removeEventListener('deviceorientationabsolute', orientationListenerRef.current)
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('deviceorientationabsolute listener removal failed:', error.message)
        }
      }

      try {
        window.removeEventListener('deviceorientation', orientationListenerRef.current)
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.log('deviceorientation listener removal failed:', error.message)
        }
      }

      orientationListenerRef.current = null
    }
  }, [])

  // コンパスの初期化
  const initializeCompass = useCallback(() => {
    try {
      removeOrientationListener()

      const listener: OrientationListener = (event: DeviceOrientationEvent) => {
        handleOrientation(event)
      }

      orientationListenerRef.current = listener

      let eventAdded = false

      // Android向けの処理を優先
      if (!isIOS && 'ondeviceorientationabsolute' in window) {
        try {
          window.addEventListener('deviceorientationabsolute', listener)
          eventAdded = true
          console.log('Added deviceorientationabsolute listener')
          setDebug('Using deviceorientationabsolute')
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.log('Failed to add deviceorientationabsolute listener:', error.message)
            setDebug('Failed absolute: ' + error.message)
          }
        }
      }

      if (!eventAdded) {
        try {
          window.addEventListener('deviceorientation', listener)
          eventAdded = true
          console.log('Added deviceorientation listener')
          setDebug('Using deviceorientation')
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.log('Failed to add deviceorientation listener:', error.message)
            setDebug('Failed orientation: ' + error.message)
          }
        }
      }

      if (!eventAdded) {
        setError('方位センサーの初期化に失敗しました。')
      } else {
        setError(null)
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Compass initialization error:', error.message)
        setDebug('Init error: ' + error.message)
      }
      setError('方位センサーの初期化中にエラーが発生しました。')
    }
  }, [handleOrientation, removeOrientationListener, isIOS])

  // 位置情報の監視
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

  // クリーンアップ
  useEffect(() => {
    return () => {
      removeOrientationListener()
    }
  }, [removeOrientationListener])

  // 方位センサーの権限リクエスト
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Permission error:', error.message)
      }
      if (!isIOS) {
        setPermissionGranted(true)
        initializeCompass()
      }
    }
  }

  const toRadians = useCallback((degrees: number) => degrees * (Math.PI / 180), [])
  const toDegrees = useCallback((radians: number) => radians * (180 / Math.PI), [])

  // 方向の計算
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

  // 目的地の変更ハンドラー
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
        <div className="text-xs text-gray-500 break-all">
          {debug}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div>現在位置: {currentPosition.latitude.toFixed(4)}, {currentPosition.longitude.toFixed(4)}</div>
        <div>方向: {Math.round(direction)}°</div>
        <div>コンパス: {Math.round(compass)}°</div>
      </CardFooter>
    </Card>
  )
}