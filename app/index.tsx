import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer, DeviceMotion, Magnetometer } from 'expo-sensors';
import React, { useEffect, useState } from 'react';
import { Button, Dimensions, StyleSheet, Text, View } from 'react-native'; // Added Platform import

const { width, height } = Dimensions.get('window');

// Main component for the faux AR app
export default function Index() {
  // Section: State Management
  // - permission: Handles camera access status
  // - heading: Current compass direction (0-360 degrees)
  // - pitch: Current tilt angle (typically ~90° when phone is vertical)
  const [permission, requestPermission] = useCameraPermissions();
  const [heading, setHeading] = useState(0);
  const [magneto, setMagneto] = useState({ x: 0, y: 0, z: 0 });
  const [acc, setAcc] = useState({ x: 0, y: 0, z: 1 }); // Added for tilt compensation
  const [pitch, setPitch] = useState(90); // Initial pitch assumption for vertical hold
  const [beta, setBeta] = useState(90); // Initial pitch assumption for vertical hold
  const [isBelowHorizon, setIsBelowHorizon] = useState(false);
  const isBelowRef = React.useRef(false);
  const Z_HYSTERESIS = 0.1; // Adjust as needed for smoothness

  // Section: Smoothing Configuration
  // - These factors control how much we smooth sensor data to reduce jitter
  // - Lower values = more smoothing (less responsive), higher = less smoothing (more responsive)
  const headingSmoothing = 0.2;
  const pitchSmoothing = 0.2;

  // Section: Refs for Smoothed Values
  // - Use refs to store smoothed heading/pitch without triggering re-renders on every sensor update
  const smoothedHeadingRef = React.useRef(0);
  const smoothedPitchRef = React.useRef(90);

  useEffect(() => {
    const subscription = Accelerometer.addListener((accData) => {
      setAcc(accData);
      const z = accData.z;
      if (isBelowRef.current) {
        // Only switch to above if z > +threshold
        if (z > Z_HYSTERESIS) {
          isBelowRef.current = false;
          setIsBelowHorizon(false);
        }
      } else {
        // Only switch to below if z < -threshold
        if (z < -Z_HYSTERESIS) {
          isBelowRef.current = true;
          setIsBelowHorizon(true);
        }
      }
    });

    // Set update interval (optional, adjust as needed)
    Accelerometer.setUpdateInterval(100); // Update every 100ms

    return () => subscription.remove(); // Clean up the listener on unmount
  }, []);

  // Magnetometer-based heading with tilt compensation
  useEffect(() => {
    const subscription = Magnetometer.addListener((magData) => {
      const { x: mx, y: my, z: mz } = magData;
      setMagneto({ x: mx, y: my, z: mz });

      // Use latest accelerometer data for tilt compensation
      const { x: ax, y: ay, z: az } = acc;

      // Calculate roll and pitch from accelerometer (in radians)
      const roll = Math.atan2(ay, az);
      const accelMagnitude = Math.sqrt(ay * ay + az * az);
      const pitchFromAcc = Math.atan2(-ax, accelMagnitude);

      // Trigonometric values
      const cosPitch = Math.cos(pitchFromAcc);
      const sinPitch = Math.sin(pitchFromAcc);
      const cosRoll = Math.cos(roll);
      const sinRoll = Math.sin(roll);

      // Tilt-compensated horizontal components (common formula)
      const Xh = mx * cosPitch + mz * sinPitch;
      const Yh = mx * sinRoll * sinPitch + my * cosRoll - mz * sinRoll * cosPitch;

      // Calculate heading
      let newHeading = Math.atan2(Yh, Xh) * (180 / Math.PI);
      if (newHeading < 0) newHeading += 360;

      console.log('Compensated heading:', newHeading);

      // Normalize to avoid jumps at 0/360
      if (Math.abs(newHeading - smoothedHeadingRef.current) > 180) {
        newHeading += newHeading < smoothedHeadingRef.current ? 360 : -360;
      }

      // Apply EMA smoothing
      smoothedHeadingRef.current =
        smoothedHeadingRef.current * (1 - headingSmoothing) + newHeading * headingSmoothing;
      setHeading((smoothedHeadingRef.current + 360) % 360);
    });
    Magnetometer.setUpdateInterval(100); // 100ms
    return () => subscription.remove();
  }, [acc]); // Depend on acc state to recalculate if acc changes (though listener is independent)

  // Section: Sensor Effect
  // - Sets up DeviceMotion listener for orientation data (pitch only)
  // - Updates every 50ms for responsiveness
  // - Applies smoothing and normalization to raw sensor data
  useEffect(() => {
    // DeviceMotion is now only used for pitch, not heading
    DeviceMotion.setUpdateInterval(50);
    const subscription = DeviceMotion.addListener((motionData) => {
      if (motionData.rotation) {
        // Pitch calculation (front/back tilt)
        const beta = motionData.rotation.beta;
        const newPitch = beta * (180 / Math.PI);
        setBeta(beta);
        // Apply EMA smoothing
        smoothedPitchRef.current =
          smoothedPitchRef.current * (1 - pitchSmoothing) + newPitch * pitchSmoothing;
        setPitch(smoothedPitchRef.current);
      }
    });
    return () => subscription.remove();
  }, []);

  // Section: Permission Handling Render
  // - Shows loading or permission request UI if camera access is not granted
  if (permission === null) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No access to camera. Please grant permission.</Text>
        <Button onPress={requestPermission} title="Grant Camera Permission" />
      </View>
    );
  }

  // Section: Waypoint Data
  // - Array of cardinal directions with their angles (extend this for real waypoints like restaurants)
  const directions = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  // Section: Field of View (FOV) Configuration
  // - fov: Horizontal FOV (~90° for typical phone camera)
  // - verticalFov: Vertical FOV (~55° for portrait mode; adjust based on device)
  // - pitchScale: Converts degrees to screen pixels for vertical movement
  const fov = 90; // Horizontal field of view
  const halfFov = fov / 2;

  const verticalFov = 55;
  const pitchScale = height / verticalFov; // Pixels per degree

  // Section: Horizon Rendering Logic (Debug Here)
  // - effectivePitch: Adjusts raw pitch relative to neutral (90° vertical hold)
  //   - Platform check: iOS and Android may invert pitch direction
  //     - iOS: Tilting down (look lower) increases pitch >90°
  //     - Android: May decrease pitch when tilting down (inverted)
  //   - If movement is wrong, swap the ternary conditions or log pitch values
  // - horizonOffset: Vertical shift in pixels
  //   - Positive effectivePitch (tilt down) -> negative offset -> moves up on screen
  //   - Negative effectivePitch (tilt up) -> positive offset -> moves down
  // - Clamping: Prevents offset from exceeding screen bounds (± half height)
  // const effectivePitch = Platform.OS === 'ios' ? (pitch - 90) : (90 - pitch);
  const effectivePitch = (pitch - 90);

  let horizonOffset;
  if (isBelowHorizon) {
    // Below horizon: move line up (negative offset)
    horizonOffset = -Math.abs(effectivePitch) * pitchScale;
  } else {
    // Above horizon: move line down (positive offset)
    horizonOffset = Math.abs(effectivePitch) * pitchScale;
  }
  horizonOffset = Math.max(-height / 2, Math.min(height / 2, horizonOffset));

  // Section: Main AR Render
  // - CameraView: Background camera feed
  // - Overlay: Contains movable AR elements (horizon and waypoints)
  // - arContainer: Translated vertically based on horizonOffset
  // - Waypoints: Positioned horizontally based on angle offset from heading
  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" />
      <View style={styles.overlay}>
        <View
          style={[
            styles.arContainer,
            {
              transform: [{ translateY: horizonOffset }],
            },
          ]}
        >
          <View style={styles.horizon} />
          {directions.map((dir) => {
            // Calculate angular offset for waypoint
            let offset = (dir.angle - heading + 720) % 360 - 180; // Normalize to -180 to 180
            if (Math.abs(offset) > halfFov) return null; // Hide if outside FOV
            const position = (offset / halfFov) * (width / 2); // Scale to screen pixels
            return (
              <Text
                key={dir.label}
                style={[
                  styles.label,
                  {
                    transform: [{ translateX: position }, { translateY: -12 }],
                  },
                ]}
              >
                {dir.label}
              </Text>
            );
          })}
        </View>
        <Text style={styles.debug}>
          Heading: {Math.round(heading)}° | Pitch: {Math.round(pitch)}° | | {isBelowHorizon ? 'Below horizon' : 'Above horizon'} | Magnetometer: x={magneto.x.toFixed(1)} y={magneto.y.toFixed(1)} z={magneto.z.toFixed(1)}
        </Text>
      </View>
    </View>
  );
}

// Section: Styles
// - Defines visual styles for UI elements
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
  arContainer: {
    width: '100%',
    alignItems: 'center',
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