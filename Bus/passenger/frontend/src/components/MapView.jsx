import React, { useEffect, useRef, useState } from 'react'

/**
 * MapView: Enhanced real-time Google Maps tracker.
 * Updates the bus marker every second and intelligently renders the route.
 */

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('No API key'))
    if (window.google && window.google.maps) return resolve(window.google.maps)

    const existing = document.querySelector(`script[data-gmaps]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps))
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')))
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.setAttribute('data-gmaps', 'true')
    script.onload = () => resolve(window.google.maps)
    script.onerror = () => reject(new Error('Failed to load Google Maps script'))
    document.head.appendChild(script)
  })
}

export default function MapView({ busInfo, routeData }) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const directionsRendererRef = useRef(null)
  const busMarkerRef = useRef(null)
  const [gmapsLoaded, setGmapsLoaded] = useState(false)
  const [autoFollow, setAutoFollow] = useState(true)

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

  // Build the route array from all possible sources
  function getRouteArray() {
    let route = null
    if (routeData) {
      if (Array.isArray(routeData)) route = routeData
      else if (Array.isArray(routeData.routeCities)) route = routeData.routeCities
    }
    if (!route && busInfo && Array.isArray(busInfo.routeCities)) route = busInfo.routeCities
    if (!route && busInfo && busInfo.fromCity && busInfo.toCity) {
      route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity]
    }
    if (!route) return null
    return route.map(r => (typeof r === 'string' ? r.trim() : String(r))).filter(Boolean)
  }

  // Load Google Maps API
  useEffect(() => {
    if (!apiKey) return
    loadGoogleMaps(apiKey).then(() => setGmapsLoaded(true)).catch(console.error)
  }, [apiKey])

  // Initialize Map
  useEffect(() => {
    if (!gmapsLoaded || !containerRef.current || mapRef.current) return

    const maps = window.google.maps
    mapRef.current = new maps.Map(containerRef.current, {
      center: { lat: 20.5937, lng: 78.9629 },
      zoom: 12,
      disableDefaultUI: false,
      mapTypeControl: false,
      streetViewControl: false,
    })

    directionsRendererRef.current = new maps.DirectionsRenderer({ 
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#2196F3',
        strokeWeight: 5,
        strokeOpacity: 0.7
      }
    })
    directionsRendererRef.current.setMap(mapRef.current)

    // Detect user interaction to disable auto-follow temporarily
    mapRef.current.addListener('dragstart', () => setAutoFollow(false))
  }, [gmapsLoaded])

  // Effect for Route Rendering (Runs only when route cities change)
  const routeString = JSON.stringify(getRouteArray())
  useEffect(() => {
    if (!gmapsLoaded || !directionsRendererRef.current) return

    const route = getRouteArray()
    if (!route || route.length < 2) {
      directionsRendererRef.current.setDirections({ routes: [] })
      return
    }

    const maps = window.google.maps
    const directionsService = new maps.DirectionsService()

    directionsService.route(
      {
        origin: route[0],
        destination: route[route.length - 1],
        waypoints: route.length > 2 ? route.slice(1, -1).map(loc => ({ location: loc, stopover: true })) : [],
        travelMode: maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === maps.DirectionsStatus.OK) {
          directionsRendererRef.current.setDirections(result)
        }
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsLoaded, routeString])

  // Effect for high-frequency Marker and Panning updates (Every 1 second)
  useEffect(() => {
    if (!gmapsLoaded || !mapRef.current || !busInfo) return

    const maps = window.google.maps
    const lat = parseFloat(busInfo.lat ?? busInfo.latitude)
    const lng = parseFloat(busInfo.lng ?? busInfo.longitude)

    if (!isNaN(lat) && !isNaN(lng)) {
      const busPos = { lat, lng }

      // Create or Move Marker
      if (!busMarkerRef.current) {
        busMarkerRef.current = new maps.Marker({
          position: busPos,
          map: mapRef.current,
          title: `Bus ${busInfo.busId}`,
          icon: {
            url: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
            scaledSize: new maps.Size(40, 40),
            anchor: new maps.Point(20, 40)
          },
          zIndex: 1000
        })
      } else {
        busMarkerRef.current.setPosition(busPos)
      }

      // Track the bus (Auto-Follow)
      if (autoFollow) {
        mapRef.current.panTo(busPos)
      }
    }
  }, [gmapsLoaded, busInfo?.lat, busInfo?.lng, busInfo?.latitude, busInfo?.longitude, autoFollow])

  if (!apiKey) return null

  return (
    <div style={{ position: 'relative', width: '100%', height: 450, marginTop: 20, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Map Overlay Controls */}
      <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          onClick={() => {
            setAutoFollow(true)
            if (busInfo && (busInfo.lat || busInfo.latitude)) {
              const pos = { 
                lat: parseFloat(busInfo.lat ?? busInfo.latitude), 
                lng: parseFloat(busInfo.lng ?? busInfo.longitude) 
              }
              mapRef.current.panTo(pos)
              mapRef.current.setZoom(15)
            }
          }}
          style={{
            padding: '8px 12px',
            backgroundColor: autoFollow ? '#4CAF50' : '#fff',
            color: autoFollow ? '#fff' : '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
        >
          {autoFollow ? '✓ Tracking' : '⊕ Follow Bus'}
        </button>
      </div>
    </div>
  )
}
