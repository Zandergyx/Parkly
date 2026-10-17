import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Compass,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Trash2,
  Map as MapIcon,
  CarFront,
} from "lucide-react";
import "./MyCar.css";

type Position = {
  lat: number;
  lng: number;
};

type SavedParking = Position & {
  floor: string;
  savedAt: string;
};

type MyCarProps = {
  onBack: () => void;
};

const STORAGE_KEY = "parkly-saved-parking";

function readParking(): SavedParking | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;

    const parsed = JSON.parse(value) as SavedParking;

    if (
      typeof parsed.lat !== "number" ||
      typeof parsed.lng !== "number" ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lng) ||
      parsed.lat < -90 ||
      parsed.lat > 90 ||
      parsed.lng < -180 ||
      parsed.lng > 180
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function distanceBetween(a: Position, b: Position) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return (
    6371000 *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)))
  );
}

function bearingBetween(a: Position, b: Position) {
  const rad = (value: number) => (value * Math.PI) / 180;
  const deg = (value: number) => (value * 180) / Math.PI;

  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const lngDiff = rad(b.lng - a.lng);

  const y = Math.sin(lngDiff) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDiff);

  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function formatDistance(metres: number) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

export default function MyCar({ onBack }: MyCarProps) {
  const [parking, setParking] = useState<SavedParking | null>(readParking);
  const [floor, setFloor] = useState("");
  const [current, setCurrent] = useState<Position | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);

  function saveParking(position: Position) {
    const saved: SavedParking = {
      ...position,
      floor: floor.trim(),
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setParking(saved);
      setCurrent(position);
      setError("");
      setSaving(false);
    } catch {
      setSaving(false);
      setError("Couldn't save your location on this device.");
    }
  }

  function captureParking() {
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location services.");
      return;
    }

    setError("");
    setSaving(true);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        saveParking({
          lat: coords.latitude,
          lng: coords.longitude,
        });
      },
      () => {
        setSaving(false);
        setError(
          "Couldn't get your location. Allow location access and try again.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    );
  }

  async function startLocating() {
    setError("");

    if (!parking) {
      setError("Save your parking location first.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Your browser doesn't support location services.");
      return;
    }

    const orientation =
      DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied">;
      };

    if (typeof orientation.requestPermission === "function") {
      try {
        const permission = await orientation.requestPermission();

        if (permission !== "granted") {
          setError(
            "Compass access wasn't granted. You can still use your location and distance.",
          );
        }
      } catch {
        setError(
          "Compass access is unavailable. You can still use your location and distance.",
        );
      }
    }

    setLocating(true);
  }

  useEffect(() => {
    if (!locating || !parking) return;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setCurrent({
          lat: coords.latitude,
          lng: coords.longitude,
        });
        setAccuracy(coords.accuracy);
      },
      () => {
        setError("Live location unavailable. Check your device settings.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );

    function handleOrientation(event: DeviceOrientationEvent) {
      const compassEvent = event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      };

      if (typeof compassEvent.webkitCompassHeading === "number") {
        setHeading(compassEvent.webkitCompassHeading);
      } else if (event.alpha !== null && event.absolute) {
        setHeading((360 - event.alpha + 360) % 360);
      }
    }

    window.addEventListener("deviceorientation", handleOrientation);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [locating, parking]);

  function clearParking() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setParking(null);
      setCurrent(null);
      setLocating(false);
      setSaving(false);
      setFloor("");
      setHeading(null);
      setAccuracy(null);
      setError("");
    } catch {
      setError("Couldn't clear your saved location.");
    }
  }

  function backToMap() {
    setLocating(false);
    onBack();
  }

  const distance =
    current && parking ? distanceBetween(current, parking) : null;

  const bearing = current && parking ? bearingBetween(current, parking) : null;

  const arrowRotation =
    bearing !== null && heading !== null ? bearing - heading : (bearing ?? 0);

  const arrived = distance !== null && distance < 10;

  return (
    <main className={`mycar ${locating ? "mycar-finding" : ""}`}>
      <header className="mycar-header">
        <button
          className="mycar-icon-button"
          onClick={backToMap}
          aria-label="Back to Parkly"
          title="Back to map"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="mycar-brand">
          <span className="mycar-brand-icon">
            <CarFront size={18} />
          </span>
          <span>
            Parkly <span className="mycar-muted">/ My Car</span>
          </span>
        </div>

        {parking && !locating ? (
          <button
            className="mycar-icon-button"
            onClick={clearParking}
            aria-label="Remove saved parking location"
            title="Remove saved location"
          >
            <Trash2 size={18} />
          </button>
        ) : (
          <span className="mycar-header-spacer" />
        )}
      </header>

      {!locating ? (
        <section className="mycar-save-view">
          <div className="mycar-intro">
            <span className="mycar-eyebrow">YOUR PARKING COMPANION</span>
            <h1>{parking ? "Car parked." : "Remember where you parked."}</h1>
            <p>
              {parking
                ? "Your parking location is saved on this device."
                : "Save your location now, and find your way back later."}
            </p>
          </div>

          {parking ? (
            <section className="mycar-card">
              <div className="mycar-card-icon">
                <MapPin size={24} />
              </div>

              <div className="mycar-card-copy">
                <span className="mycar-eyebrow">SAVED LOCATION</span>
                <h2>Your car is here</h2>
                <p>
                  {parking.lat.toFixed(5)}, {parking.lng.toFixed(5)}
                </p>

                {parking.floor && (
                  <span className="mycar-floor">
                    <Layers size={14} />
                    Level {parking.floor}
                  </span>
                )}

                <span className="mycar-saved-time">
                  Saved{" "}
                  {new Date(parking.savedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <Check className="mycar-check" size={20} />
            </section>
          ) : (
            <section className="mycar-form-card">
              <div className="mycar-form-icon">
                <LocateFixed size={24} />
              </div>

              <h2>Save your parking spot</h2>
              <p>
                Park first, then save your current position. Stay in a safe,
                stationary place while recording it.
              </p>

              <label htmlFor="mycar-floor">Level or floor (optional)</label>
              <input
                id="mycar-floor"
                value={floor}
                onChange={(event) => setFloor(event.target.value)}
                placeholder="e.g. B2, Level 4, Zone C"
                maxLength={60}
              />

              <button
                className="mycar-primary"
                onClick={captureParking}
                disabled={saving}
              >
                <MapPin size={18} />
                {saving ? "Saving location…" : "Save parking location"}
              </button>
            </section>
          )}

          {parking && (
            <button
              className="mycar-primary mycar-locate-button"
              onClick={startLocating}
            >
              <LocateFixed size={19} />
              Locate My Car
            </button>
          )}

          {parking && (
            <button
              className="mycar-secondary"
              onClick={() => {
                setFloor(parking.floor);
                setSaving(false);
                setParking(null);
                setError("");
              }}
            >
              Update parking location
            </button>
          )}

          {error && (
            <p className="mycar-error" role="alert">
              {error}
            </p>
          )}

          <p className="mycar-privacy">
            Your saved location stays on this device.
          </p>
        </section>
      ) : (
        <section className="mycar-finding-view">
          <div className="mycar-finding-top">
            <span className="mycar-live-dot" />
            <span>FINDING YOUR CAR</span>
            <span className="mycar-live-line" />
          </div>

          <div className="mycar-distance">
            <span>
              {arrived ? "YOU'RE NEAR YOUR CAR" : "DISTANCE TO YOUR CAR"}
            </span>
            <strong>
              {distance === null ? "—" : formatDistance(distance)}
            </strong>
            <p>
              {current
                ? arrived
                  ? "Check the surrounding parking bays."
                  : "Follow the arrow and check the saved floor."
                : "Waiting for your current location…"}
            </p>
          </div>

          <div className="mycar-radar">
            <div className="mycar-radar-ring ring-one" />
            <div className="mycar-radar-ring ring-two" />
            <div className="mycar-radar-ring ring-three" />
            <div className="mycar-radar-cross cross-horizontal" />
            <div className="mycar-radar-cross cross-vertical" />

            <div className="mycar-radar-center">
              <LocateFixed size={21} />
            </div>

            <div
              className="mycar-direction"
              style={{
                transform: `translate(-50%, -50%) rotate(${arrowRotation}deg)`,
              }}
            >
              <ArrowUp size={78} strokeWidth={1.8} />
            </div>

            <div className="mycar-car-pin">
              <CarFront size={21} />
            </div>
          </div>

          <div className="mycar-location-status">
            <div className="mycar-status-icon">
              <Compass size={20} />
            </div>
            <div className="mycar-status-copy">
              <strong>
                {heading !== null
                  ? "Compass guidance available"
                  : "Direction estimate"}
              </strong>
              <span>
                {heading !== null
                  ? "Arrow adjusts with your phone's compass."
                  : "Direction is relative to north until compass heading is available."}
              </span>
            </div>
          </div>

          {parking?.floor && (
            <div className="mycar-floor-banner">
              <Layers size={17} />
              <span>Remember: your car is on</span>
              <strong>{parking.floor}</strong>
            </div>
          )}

          {accuracy !== null && (
            <p className="mycar-accuracy">
              GPS accuracy approximately ±{Math.round(accuracy)} m
            </p>
          )}

          {error && (
            <p className="mycar-error" role="alert">
              {error}
            </p>
          )}

          <div className="mycar-finding-actions">
            <button className="mycar-primary" onClick={backToMap}>
              <ArrowLeft size={18} />
              Back to Parkly
            </button>

            <button className="mycar-found-button" onClick={clearParking}>
              <Check size={18} />
              I've found my car
            </button>
          </div>
        </section>
      )}

      <nav className="mycar-bottom-nav" aria-label="Main navigation">
        <button onClick={backToMap}>
          <MapIcon size={20} />
          <span>Map</span>
        </button>

        <button onClick={backToMap}>
          <span className="mycar-nav-list-icon">
            <Layers size={20} />
          </span>
          <span>Availability</span>
        </button>

        <button onClick={backToMap}>
          <span className="mycar-nav-list-icon">
            <Check size={20} />
          </span>
          <span>Saved</span>
        </button>

        <button className="active" aria-current="page">
          <CarFront size={20} />
          <span>My Car</span>
        </button>
      </nav>
    </main>
  );
}
