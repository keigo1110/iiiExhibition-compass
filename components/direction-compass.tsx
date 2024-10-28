'use client'

import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function DirectionCompass() {
  const [currentPosition, setCurrentPosition] = useState({ latitude: 0, longitude: 0 })
  const [destination, setDestination] = useState({ latitude: 35.7114, longitude: 139.7611 })
  const [heading, setHeading] = useState(0)
  const [direction, setDirection] = useState(0)
  const [permissionGranted, setPermissionGranted] = useState(false)

  useEffect(() => {
    // 高精度で位置情報の取得
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        })
      },
      (error) => console.error('位置情報の取得に失敗しました:', error),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 3000 } // 更新頻度を上げる
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // デバイスの向きの取得をユーザーのタップで開始
  const requestDeviceOrientationPermission = () => {
    const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission

    if (requestPermission) {
      requestPermission()
        .then((response: string) => {
          if (response === 'granted') {
            setPermissionGranted(true)
            window.addEventListener('deviceorientation', handleOrientation)
          }
        })
        .catch(console.error)
    } else {
      setPermissionGranted(true)
      window.addEventListener('deviceorientation', handleOrientation)
    }
  }

  const handleOrientation = (event: DeviceOrientationEvent) => {
    console.log("Device heading:", event.alpha) // デバッグ用
    setHeading(event.alpha ?? 0)
  }

  useEffect(() => {
    // 目的地の方向を計算
    const y = Math.sin(toRadians(destination.longitude - currentPosition.longitude))
    const x = Math.cos(toRadians(currentPosition.latitude)) * Math.tan(toRadians(destination.latitude)) -
              Math.sin(toRadians(currentPosition.latitude)) * Math.cos(toRadians(destination.longitude - currentPosition.longitude))

    let bearing = Math.atan2(y, x)
    bearing = toDegrees(bearing)
    bearing = (bearing + 360) % 360 // 方角を0-360度に正規化

    // 相対的な方角を計算
    const relativeDirection = (bearing - heading + 360) % 360
    setDirection(relativeDirection)

    // デバッグ用
    console.log("Calculated bearing:", bearing, "Relative direction:", relativeDirection)
  }, [currentPosition, destination, heading])

  const toRadians = (degrees: number) => degrees * (Math.PI / 180)
  const toDegrees = (radians: number) => radians * (180 / Math.PI)

  const handleDestinationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [lat, lon] = e.target.value.split(',').map(Number)
    if (!isNaN(lat) && !isNaN(lon)) {
      setDestination({ latitude: lat, longitude: lon })
    } else {
      console.error("Invalid destination coordinates")
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>方位磁石アプリ</CardTitle>
        <CardDescription>目的地の方向を指し示します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <ArrowUp
            className="mx-auto text-primary"
            style={{ transform: `rotate(${direction}deg)`, transition: 'transform 0.2s ease-out' }} // 0.2秒に短縮
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
          <Button onClick={requestDeviceOrientationPermission}>デバイスの向きを許可</Button>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div>現在位置: {currentPosition.latitude.toFixed(4)}, {currentPosition.longitude.toFixed(4)}</div>
        <div>方向: {Math.round(direction)}°</div>
      </CardFooter>
    </Card>
  )
}