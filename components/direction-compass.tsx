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

  // ブラウザチェックを追加
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent))
    }
  }, [])

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    try {
      const compassEvent = event as DeviceOrientationEventWithWebkit

      // iOS の場合
      if (isIOS && typeof compassEvent.webkitCompassHeading === 'number') {
        setCompass(compassEvent.webkitCompassHeading)
        setDebug(`iOS: webkitCompassHeading=${compassEvent.webkitCompassHeading.toFixed(1)}`)
        setError(null)
        return
      }

      // Androidの場合
      if (!isIOS && event.absolute && typeof event.alpha === 'number') {
        let heading = event.alpha
        const beta = event.beta || 0
        const gamma = event.gamma || 0

        setDebug(`Android Absolute: alpha=${heading.toFixed(1)}°, beta=${beta.toFixed(1)}°, gamma=${gamma.toFixed(1)}°, screen=${window.screen.orientation?.angle || 0}°`)

        if (Math.abs(beta) > 50 || Math.abs(gamma) > 50) {
          setError('デバイスをより水平に保持してください')
        } else {
          setError(null)
        }

        const screenAngle = window.screen.orientation?.angle || 0
        heading = (heading + screenAngle) % 360
        heading = (360 - heading) % 360

        setCompass(heading)
        return
      }

      // 通常のdeviceorientationイベントの場合
      if (!isIOS && typeof event.alpha === 'number') {
        let heading = event.alpha
        const beta = event.beta || 0
        const gamma = event.gamma || 0

        setDebug(`Android Regular: alpha=${heading.toFixed(1)}°, beta=${beta.toFixed(1)}°, gamma=${gamma.toFixed(1)}°, screen=${window.screen.orientation?.angle || 0}°`)

        if (Math.abs(beta) > 50 || Math.abs(gamma) > 50) {
          setError('デバイスをより水平に保持してください')
        } else {
          setError(null)
        }

        const screenAngle = window.screen.orientation?.angle || 0
        heading = (heading + screenAngle) % 360
        heading = (360 - heading) % 360

        setCompass(heading)
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Orientation handling error:', error.message)
        setDebug(`Error: ${error.message}`)
      }
      setError('方位の取得中にエラーが発生しました。')
    }
  }, [isIOS])

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

  const initializeCompass = useCallback(() => {
    try {
      removeOrientationListener()

      const listener: OrientationListener = (event: DeviceOrientationEvent) => {
        handleOrientation(event)
      }

      orientationListenerRef.current = listener
      let eventAdded = false

      // Android の場合は deviceorientationabsolute を優先
      if (!isIOS) {
        if ('ondeviceorientationabsolute' in window) {
          try {
            window.addEventListener('deviceorientationabsolute', listener)
            eventAdded = true
            setDebug('Using deviceorientationabsolute (Android)')
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
            setDebug('Using deviceorientation (Android fallback)')
          } catch (error: unknown) {
            if (error instanceof Error) {
              console.log('Failed to add deviceorientation listener:', error.message)
              setDebug('Failed orientation: ' + error.message)
            }
          }
        }
      } else {
        // iOS の場合は deviceorientation のみを使用
        try {
          window.addEventListener('deviceorientation', listener)
          eventAdded = true
          setDebug('Using deviceorientation (iOS)')
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.log('Failed to add deviceorientation listener:', error.message)
            setDebug('Failed orientation: ' + error.message)
          }
        }
      }

      if (!eventAdded) {
        setError('方位センサーの初期化に失敗しました。')
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Compass initialization error:', error.message)
        setDebug('Init error: ' + error.message)
      }
      setError('方位センサーの初期化中にエラーが発生しました。')
    }
  }, [handleOrientation, removeOrientationListener, isIOS])

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