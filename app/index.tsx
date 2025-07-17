import { CameraView, useCameraPermissions } from 'expo-camera'; // Updated import for hook
import { DeviceMotion } from 'expo-sensors';
import React, { useEffect, useState } from 'react';
import { Button, Dimensions, StyleSheet, Text, View } from 'react-native'; // Added Button import

const { width } = Dimensions.get('window');

export default function Index() {
  const [permission, requestPermission] = useCameraPermissions(); // Use the permissions hook
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    DeviceMotion.setUpdateInterval(100); // Update every 100ms for smoother animation without overwhelming the UI
    const subscription = DeviceMotion.addListener((motionData) => {
      if (motionData.rotation) {
        const alpha = motionData.rotation.alpha;
        const newHeading = ((alpha * (180 / Math.PI) + 360) % 360);
        setHeading(newHeading);
      }
    });
    return () => subscription.remove();
  }, []);

  if (permission === null) {
    return <View />; // Loading state while checking permissions
  }

  if (!permission.granted) {
    // If permission not granted, show a message and button to request
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No access to camera. Please grant permission.</Text>
        <Button onPress={requestPermission} title="Grant Camera Permission" />
      </View>
    );
  }

  const directions = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  const fov = 90; // Field of view in degrees (approximating a typical phone camera's horizontal FOV)
  const halfFov = fov / 2;

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" /> {/* Updated prop if needed, but "back" is fine */}
      <View style={styles.overlay}>
        <View style={styles.horizon} />
        {directions.map((dir) => {
          let offset = (dir.angle - heading + 720) % 360 - 180; // Normalize offset to -180 to 180 degrees
          if (Math.abs(offset) > halfFov) return null; // Hide if outside the field of view
          const position = (offset / halfFov) * (width / 2); // Calculate horizontal position
          return (
            <Text
              key={dir.label}
              style={[
                styles.label,
                {
                  transform: [{ translateX: position }, { translateY: -12 }], // Adjust Y for vertical centering
                },
              ]}
            >
              {dir.label}
            </Text>
          );
        })}
        <Text style={styles.debug}>Heading: {Math.round(heading)}°</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  horizon: {
    width: '100%',
    height: 2,
    backgroundColor: 'white',
  },
  label: {
    position: 'absolute',
    left: '50%',
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  debug: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    color: 'white',
    fontSize: 16,
  },
});