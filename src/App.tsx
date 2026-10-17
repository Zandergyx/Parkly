import { memo, useEffect, useMemo, useRef, useState } from "react";
import MyCar from "./MyCar";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import {
  Map as MapIcon,
  List,
  Heart,
  Search,
  LocateFixed,
  Navigation,
  ArrowUpRight,
  SlidersHorizontal,
  Clock3,
  CarFront,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

type CarPark = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  available: number;
  agency: string;
  lotType: string;
};

type LtaRecord = {
  CarParkID: string;
  Area: string;
  Development: string;
  Location: string;
  AvailableLots: number;
  LotType: string;
  Agency: string;
};

type LtaResponse = {
  value: LtaRecord[];
  count: number;
  fetchedAt: string;
};

type Tab = "map" | "availability" | "saved" | "my-car";
type SortOption = "nearest" | "most-lots" | "alphabetical";

type UserLocation = {
  lat: number;
  lng: number;
};

function getAvailability(count: number) {
  if (count === 0) {
    return { label: "Full", color: "#8e8e93", bg: "#f0f0f2" };
  }

  if (count <= 10) {
    return { label: "Limited", color: "#b7791f", bg: "#fff3d8" };
  }

  return { label: "Available", color: "#24834b", bg: "#e4f5e9" };
}

function getDistance(first: UserLocation, second: UserLocation): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const latDifference = toRadians(second.lat - first.lat);
  const lngDifference = toRadians(second.lng - first.lng);

  const value =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(toRadians(first.lat)) *
      Math.cos(toRadians(second.lat)) *
      Math.sin(lngDifference / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function formatDistance(distanceKm: number) {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

function FlyToSelection({ carPark }: { carPark: CarPark | null }) {
  const map = useMap();

  useEffect(() => {
    if (carPark) {
      map.flyTo([carPark.lat, carPark.lng], 16, {
        duration: 0.5,
      });
    }
  }, [carPark, map]);

  return null;
}

const CarParkMarkers = memo(function CarParkMarkers({
  parks,
  selected,
  onSelect,
}: {
  parks: CarPark[];
  selected: CarPark | null;
  onSelect: (park: CarPark) => void;
}) {
  return (
    <>
      {parks.map((park) => {
        const status = getAvailability(park.available);

        return (
          <CircleMarker
            key={park.id}
            center={[park.lat, park.lng]}
            radius={selected?.id === park.id ? 11 : 8}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: status.color,
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: () => onSelect(park),
            }}
          >
            <Popup>
              <strong>{park.name}</strong>
              <br />
              {park.available} available car lots
              <br />
              <button onClick={() => onSelect(park)}>View details</button>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
});

function App() {
  const [tab, setTab] = useState<Tab>("map");
  const [selected, setSelected] = useState<CarPark | null>(null);
  const [query, setQuery] = useState("");

  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("parkly-favourites");
      if (!stored) return [];

      const parsed: unknown = JSON.parse(stored);

      return Array.isArray(parsed) &&
        parsed.every((id) => typeof id === "string")
        ? parsed
        : [];
    } catch {
      return [];
    }
  });

  const [availableOnly, setAvailableOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedMall, setSelectedMall] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("nearest");

  const [useMyLocation, setUseMyLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [carParks, setCarParks] = useState<CarPark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const filterWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("parkly-favourites", JSON.stringify(saved));
    } catch (error) {
      console.error("Unable to save Parkly favourites:", error);
    }
  }, [saved]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCarParks() {
      try {
        const response = await fetch("/api/carpark-availability");

        if (!response.ok) {
          throw new Error(`API request failed (${response.status})`);
        }

        const data: LtaResponse = await response.json();

        if (!Array.isArray(data.value)) {
          throw new Error("Unexpected response from the LTA API.");
        }

        const parks = data.value
          .filter(
            (record) =>
              record.LotType === "C" &&
              typeof record.AvailableLots === "number" &&
              record.AvailableLots >= 0,
          )
          .flatMap((record): CarPark[] => {
            const coordinates = record.Location.trim().split(/\s+/).map(Number);

            const [lat, lng] = coordinates;

            if (
              coordinates.length !== 2 ||
              !Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              lat < -90 ||
              lat > 90 ||
              lng < -180 ||
              lng > 180
            ) {
              return [];
            }

            return [
              {
                id: `${record.Agency}-${record.CarParkID}`,
                name: record.Development || `Car park ${record.CarParkID}`,
                area: record.Area || "Singapore",
                lat,
                lng,
                available: record.AvailableLots,
                agency: record.Agency,
                lotType: record.LotType,
              },
            ];
          });

        if (!cancelled) {
          setCarParks(parks);
          setLastUpdated(new Date().toLocaleTimeString());
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load carpark availability.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchCarParks();

    const interval = window.setInterval(fetchCarParks, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!filterOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        filterWrapperRef.current &&
        !filterWrapperRef.current.contains(event.target as Node)
      ) {
        setFilterOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFilterOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [filterOpen]);

  const areas = useMemo(
    () =>
      [...new Set(carParks.map((park) => park.area).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [carParks],
  );

  const malls = useMemo(
    () =>
      [
        ...new Set(
          carParks
            .filter(
              (park) => selectedArea === "all" || park.area === selectedArea,
            )
            .map((park) => park.name)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [carParks, selectedArea],
  );

  const filtered = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();

    const results = carParks.filter((park) => {
      const matchesQuery = `${park.name} ${park.area}`
        .toLowerCase()
        .includes(searchTerm);

      const matchesArea = selectedArea === "all" || park.area === selectedArea;
      const matchesMall = selectedMall === "all" || park.name === selectedMall;
      const matchesAvailability = !availableOnly || park.available > 0;

      return matchesQuery && matchesArea && matchesMall && matchesAvailability;
    });

    return results.sort((a, b) => {
      if (sortBy === "most-lots") {
        return b.available - a.available;
      }

      if (sortBy === "alphabetical") {
        return a.name.localeCompare(b.name);
      }

      if (userLocation) {
        return (
          getDistance(userLocation, { lat: a.lat, lng: a.lng }) -
          getDistance(userLocation, { lat: b.lat, lng: b.lng })
        );
      }

      return b.available - a.available;
    });
  }, [
    carParks,
    query,
    selectedArea,
    selectedMall,
    availableOnly,
    sortBy,
    userLocation,
  ]);

  const shownParks =
    tab === "saved"
      ? carParks
          .filter((park) => saved.includes(park.id))
          .sort((a, b) => a.name.localeCompare(b.name))
      : filtered;

  const activeFilterCount = [
    selectedArea !== "all",
    selectedMall !== "all",
    availableOnly,
    useMyLocation,
    sortBy !== "nearest",
  ].filter(Boolean).length;

  function toggleSaved(id: string) {
    setSaved((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function requestUserLocation() {
    if (!navigator.geolocation) {
      setLocationError("Your browser does not support location access.");
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = {
          lat: coords.latitude,
          lng: coords.longitude,
        };

        setUserLocation(position);
        setUseMyLocation(true);
        setSortBy("nearest");
        setLocationLoading(false);

        setSelected({
          id: "current",
          name: "Your location",
          area: "Current position",
          lat: position.lat,
          lng: position.lng,
          available: 0,
          agency: "",
          lotType: "C",
        });
      },
      (positionError) => {
        setLocationLoading(false);
        setUseMyLocation(false);

        if (positionError.code === positionError.PERMISSION_DENIED) {
          setLocationError(
            "Location permission was denied. Allow location access in your browser settings and try again.",
          );
        } else if (positionError.code === positionError.POSITION_UNAVAILABLE) {
          setLocationError("Your current location is unavailable.");
        } else {
          setLocationError("Location request timed out. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    );
  }

  function toggleMyLocation() {
    if (useMyLocation) {
      setUseMyLocation(false);
      setUserLocation(null);
      setLocationError(null);

      if (selected?.id === "current") {
        setSelected(null);
      }

      return;
    }

    requestUserLocation();
  }

  function resetFilters() {
    setSelectedArea("all");
    setSelectedMall("all");
    setAvailableOnly(false);
    setUseMyLocation(false);
    setUserLocation(null);
    setLocationError(null);
    setSortBy("nearest");
  }

  return (
    <>
      {tab === "my-car" ? (
        <MyCar onBack={() => setTab("map")} />
      ) : (
        <main className="app-shell">
          <header className="topbar">
            <button
              className="brand"
              onClick={() => setTab("map")}
              aria-label="Parkly home"
            >
              <span className="brand-mark">
                <CarFront size={21} strokeWidth={2.2} />
              </span>
              <span>Parkly</span>
            </button>

            <div className="topbar-actions">
              <button
                className="icon-button"
                aria-label="Locate me"
                title="Go to my location"
                onClick={requestUserLocation}
              >
                <LocateFixed size={19} />
              </button>
            </div>
          </header>

          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR PARKING COMPANION</p>
              <h1>
                {tab === "map"
                  ? "Find a spot."
                  : tab === "availability"
                    ? "Parking nearby."
                    : "Your favourites."}
              </h1>
              <p className="subtitle">
                Find somewhere to park, without the guesswork.
              </p>
            </div>
          </div>

          <section className={`workspace ${tab !== "map" ? "list-mode" : ""}`}>
            <aside className="sidebar">
              <label className="search-box">
                <Search size={18} />

                <input
                  placeholder="Search car parks or areas"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />

                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                  >
                    <X size={16} />
                  </button>
                )}
              </label>

              <div className="list-toolbar">
                <div>
                  <h2>{tab === "saved" ? "Saved car parks" : "Car parks"}</h2>

                  <span>
                    {loading
                      ? "Loading live data…"
                      : `${shownParks.length} locations`}
                  </span>
                </div>

                <div className="filter-wrapper" ref={filterWrapperRef}>
                  <button
                    type="button"
                    className={`filter-button ${
                      filterOpen || activeFilterCount > 0 ? "active" : ""
                    }`}
                    onClick={() => setFilterOpen((open) => !open)}
                    aria-label="Open filters"
                    aria-expanded={filterOpen}
                    title="Filter and sort car parks"
                  >
                    <SlidersHorizontal size={16} />
                  </button>

                  {filterOpen && (
                    <div className="filter-popover">
                      <div className="filter-popover-header">
                        <div>
                          <h3>Filters & sorting</h3>
                          <p>Make finding a spot easier.</p>
                        </div>

                        <button
                          type="button"
                          className="filter-close"
                          onClick={() => setFilterOpen(false)}
                          aria-label="Close filters"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="filter-section">
                        <label htmlFor="parkly-area">Area</label>

                        <select
                          id="parkly-area"
                          value={selectedArea}
                          onChange={(event) => {
                            setSelectedArea(event.target.value);
                            setSelectedMall("all");
                          }}
                        >
                          <option value="all">All areas</option>

                          {areas.map((area) => (
                            <option key={area} value={area}>
                              {area}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="filter-section">
                        <label htmlFor="parkly-mall">Mall or car park</label>

                        <select
                          id="parkly-mall"
                          value={selectedMall}
                          onChange={(event) =>
                            setSelectedMall(event.target.value)
                          }
                        >
                          <option value="all">All car parks</option>

                          {malls.map((mall) => (
                            <option key={mall} value={mall}>
                              {mall}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="filter-divider" />

                      <button
                        type="button"
                        className="filter-toggle-row"
                        onClick={() => setAvailableOnly((value) => !value)}
                        aria-pressed={availableOnly}
                      >
                        <span className="filter-toggle-copy">
                          <strong>Available spots only</strong>
                          <span>Hide car parks with no available lots.</span>
                        </span>

                        <span
                          className={`toggle-track ${availableOnly ? "on" : ""}`}
                          aria-hidden="true"
                        >
                          <span />
                        </span>
                      </button>

                      <button
                        type="button"
                        className="filter-toggle-row"
                        onClick={toggleMyLocation}
                        aria-pressed={useMyLocation}
                        disabled={locationLoading}
                      >
                        <span className="filter-toggle-copy">
                          <strong>Use my location</strong>
                          <span>
                            {locationLoading
                              ? "Getting your location…"
                              : "Sort car parks by distance from you."}
                          </span>
                        </span>

                        <span
                          className={`toggle-track ${useMyLocation ? "on" : ""}`}
                          aria-hidden="true"
                        >
                          <span />
                        </span>
                      </button>

                      {locationError && (
                        <p className="filter-error" role="alert">
                          {locationError}
                        </p>
                      )}

                      <div className="filter-section">
                        <label htmlFor="parkly-sort">Sort by</label>

                        <select
                          id="parkly-sort"
                          value={sortBy}
                          onChange={(event) =>
                            setSortBy(event.target.value as SortOption)
                          }
                        >
                          <option value="nearest">
                            {userLocation
                              ? "Nearest to me"
                              : "Most available first"}
                          </option>
                          <option value="most-lots">Most available lots</option>
                          <option value="alphabetical">
                            Alphabetical (A–Z)
                          </option>
                        </select>
                      </div>

                      {!userLocation && sortBy === "nearest" && (
                        <p className="filter-hint">
                          Enable Use my location to sort by actual distance.
                          Otherwise, car parks with more available lots appear
                          first.
                        </p>
                      )}

                      <div className="filter-footer">
                        <button
                          type="button"
                          className="filter-reset"
                          onClick={resetFilters}
                        >
                          Reset
                        </button>

                        <button
                          type="button"
                          className="filter-done"
                          onClick={() => setFilterOpen(false)}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="empty-state" role="alert">
                  <p>Couldn't load live data</p>
                  <span>{error}</span>
                </div>
              )}

              <div className="parking-list">
                {shownParks.map((park) => {
                  const status = getAvailability(park.available);
                  const isSelected = selected?.id === park.id;

                  const distance =
                    userLocation &&
                    getDistance(userLocation, {
                      lat: park.lat,
                      lng: park.lng,
                    });

                  return (
                    <article
                      key={park.id}
                      className={`parking-card ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelected(park);
                        setTab(tab === "saved" ? "saved" : "map");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(park);
                          setTab(tab === "saved" ? "saved" : "map");
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="parking-card-top">
                        <div className="parking-icon">
                          <CarFront size={19} />
                        </div>

                        <span
                          className="availability-badge"
                          style={{
                            color: status.color,
                            background: status.bg,
                          }}
                        >
                          {status.label}
                        </span>
                      </div>

                      <h3>{park.name}</h3>
                      <p className="parking-area">{park.area}</p>

                      <div className="parking-card-bottom">
                        <div>
                          <strong>{park.available}</strong>
                          <span> lots available</span>

                          {distance !== null && distance !== undefined && (
                            <span className="distance-label">
                              {" "}
                              · {formatDistance(distance)}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          className={`save-button ${
                            saved.includes(park.id) ? "saved" : ""
                          }`}
                          aria-label={
                            saved.includes(park.id)
                              ? "Remove favourite"
                              : "Save car park"
                          }
                          aria-pressed={saved.includes(park.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleSaved(park.id);
                          }}
                        >
                          <Heart
                            size={17}
                            fill={
                              saved.includes(park.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!loading && shownParks.length === 0 && !error && (
                  <div className="empty-state">
                    <Search size={25} />
                    <p>No car parks found</p>
                    <span>Try changing your search or filters.</span>
                  </div>
                )}

                {loading && shownParks.length === 0 && (
                  <div className="empty-state">
                    <Clock3 size={25} />
                    <p>Loading car parks…</p>
                    <span>Fetching availability from LTA.</span>
                  </div>
                )}
              </div>
            </aside>

            <section className="map-panel">
              <MapContainer
                center={[1.3008, 103.85]}
                zoom={12}
                zoomControl={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <FlyToSelection carPark={selected} />

                {userLocation && (
                  <CircleMarker
                    center={[userLocation.lat, userLocation.lng]}
                    radius={9}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 3,
                      fillColor: "#007aff",
                      fillOpacity: 1,
                    }}
                  >
                    <Popup>Your current location</Popup>
                  </CircleMarker>
                )}

                <CarParkMarkers
                  parks={filtered}
                  selected={selected}
                  onSelect={setSelected}
                />
              </MapContainer>

              <div className="map-overlay-label">
                <span className="live-dot" />
                Singapore car parks
              </div>

              {selected && selected.id !== "current" && (
                <div className="detail-sheet">
                  <button
                    className="sheet-close"
                    onClick={() => setSelected(null)}
                    aria-label="Close details"
                  >
                    <X size={18} />
                  </button>

                  <div className="sheet-heading">
                    <div className="parking-icon large">
                      <CarFront size={22} />
                    </div>

                    <div>
                      <h3>{selected.name}</h3>
                      <p>{selected.area}</p>
                    </div>

                    <button
                      className={`save-button ${
                        saved.includes(selected.id) ? "saved" : ""
                      }`}
                      onClick={() => toggleSaved(selected.id)}
                      aria-label={
                        saved.includes(selected.id)
                          ? "Remove favourite"
                          : "Save car park"
                      }
                      aria-pressed={saved.includes(selected.id)}
                    >
                      <Heart
                        size={19}
                        fill={
                          saved.includes(selected.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                  </div>

                  <div className="lot-summary">
                    <div>
                      <span>Available car lots</span>
                      <strong>{selected.available}</strong>
                    </div>

                    <div>
                      <span>Data provider</span>
                      <strong>{selected.agency || "—"}</strong>
                    </div>
                  </div>

                  <button
                    className="directions-button"
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                  >
                    <Navigation size={17} />
                    Directions
                    <ArrowUpRight size={16} />
                  </button>
                </div>
              )}

              {selected?.id === "current" && (
                <div className="detail-sheet">
                  <button
                    className="sheet-close"
                    onClick={() => setSelected(null)}
                    aria-label="Close location"
                  >
                    <X size={18} />
                  </button>

                  <div className="sheet-heading">
                    <div className="parking-icon large">
                      <LocateFixed size={22} />
                    </div>

                    <div>
                      <h3>Your location</h3>
                      <p>Current position</p>
                    </div>
                  </div>

                  <button
                    className="directions-button"
                    onClick={() => setSelected(null)}
                  >
                    Back to car parks
                  </button>
                </div>
              )}

              <div className="map-attribution">
                <Clock3 size={12} />
                {loading
                  ? "Connecting to LTA…"
                  : error
                    ? "Live data unavailable"
                    : `LTA data · Updated ${lastUpdated ?? "recently"}`}
              </div>
            </section>
          </section>

          <nav className="bottom-nav" aria-label="Main navigation">
            <button
              className={tab === "map" ? "active" : ""}
              onClick={() => setTab("map")}
              aria-current={tab === "map" ? "page" : undefined}
            >
              <MapIcon size={20} />
              <span>Map</span>
            </button>

            <button
              className={tab === "availability" ? "active" : ""}
              onClick={() => setTab("availability")}
              aria-current={tab === "availability" ? "page" : undefined}
            >
              <List size={20} />
              <span>Availability</span>
            </button>

            <button
              className={tab === "saved" ? "active" : ""}
              onClick={() => setTab("saved")}
              aria-current={tab === "saved" ? "page" : undefined}
            >
              <Heart size={20} />
              <span>Saved</span>
            </button>

            <button onClick={() => setTab("my-car")}>
              <CarFront size={20} />
              <span>My Car</span>
            </button>
          </nav>
        </main>
      )}
    </>
  );
}

export default App;
