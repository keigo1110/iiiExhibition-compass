'use client'

import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// iOSのDeviceOrientationEvent拡張インターフェース
interface DeviceOrientationEventWithWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

export function DirectionCompass() {
  const [currentPosition, setCurrentPosition] = useState({ latitude: 0, longitude: 0 })
  const [destination, setDestination] = useState({ latitude: 35.7114, longitude: 139.7611 })
  const [compass, setCompass] = useState(0)
  const [direction, setDirection] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestDeviceOrientationPermission = async () => {
    try {
      const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission

      if (requestPermission) {
        // iOS 13+
        const response = await requestPermission()
        if (response === 'granted') {
          setPermissionGranted(true)
          initializeCompass()
        } else {
          setError('方位センサーの使用が許可されませんでした。')
        }
      } else {
        // Android または 古いiOS
        setPermissionGranted(true)
        initializeCompass()
      }
    } catch (err) {
      setError('方位センサーの初期化に失敗しました。')
      console.error(err)
    }
  }

  const initializeCompass = () => {
    window.addEventListener('deviceorientationabsolute', handleOrientation)
    // フォールバック: absolute が使えない場合
    window.addEventListener('deviceorientation', handleOrientation)
  }

  const handleOrientation = (event: DeviceOrientationEvent) => {
    // iOS
    const compassEvent = event as DeviceOrientationEventWithWebkit
    if (typeof compassEvent.webkitCompassHeading === 'number') {
      setCompass(compassEvent.webkitCompassHeading)
      return
    }

    // Android
    const alpha = event.alpha
    if (alpha !== null) {
      // Android では alpha を 360 - alpha で変換する必要がある
      setCompass(360 - alpha)
    }
  }

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
      },
      (positionError: GeolocationPositionError) => {
        setError('位置情報の取得に失敗しました。')
        console.error('Geolocation error:', positionError.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 3000
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      window.removeEventListener('deviceorientationabsolute', handleOrientation)
      window.removeEventListener('deviceorientation', handleOrientation)
    }
  }, [])

  useEffect(() => {
    const y = Math.sin(toRadians(destination.longitude - currentPosition.longitude))
    const x = Math.cos(toRadians(currentPosition.latitude)) * Math.tan(toRadians(destination.latitude)) -
              Math.sin(toRadians(currentPosition.latitude)) * Math.cos(toRadians(destination.longitude - currentPosition.longitude))

    let bearing = Math.atan2(y, x)
    bearing = toDegrees(bearing)
    bearing = (bearing + 360) % 360

    // コンパスの値を考慮して相対的な方向を計算
    const relativeDirection = (bearing - compass + 360) % 360
    setDirection(relativeDirection)
  }, [currentPosition, destination, compass])

  const toRadians = (degrees: number) => degrees * (Math.PI / 180)
  const toDegrees = (radians: number) => radians * (180 / Math.PI)

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [lat, lon] = e.target.value.split(',').map(Number)
    if (!isNaN(lat) && !isNaN(lon)) {
      setDestination({ latitude: lat, longitude: lon })
    } else {
      setError("無効な座標が入力されました。")
    }
  }

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
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div>現在位置: {currentPosition.latitude.toFixed(4)}, {currentPosition.longitude.toFixed(4)}</div>
        <div>方向: {Math.round(direction)}°</div>
        <div>コンパス: {Math.round(compass)}°</div>
      </CardFooter>
    </Card>
  )
}