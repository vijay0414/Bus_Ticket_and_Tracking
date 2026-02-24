import React, { useEffect, useRef, useState } from 'react'

// MapView: renders a Google Maps Directions route based on `routeData` or `busInfo.routeCities`.
// Requires `VITE_GOOGLE_MAPS_API_KEY` in the passenger frontend environment to render in-page.
// If no API key is provided, MapView shows a helpful link to open the route in Google Maps.

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

export default function MapView({ busInfo, routeData, buses = [] }) {
  const mapRef = useRef(null)
  const containerRef = useRef(null)
  const directionsRendererRef = useRef(null)
  const busMarkerRef = useRef(null)
  const [gmapsLoaded, setGmapsLoaded] = useState(false)

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

  // Normalize route: prefer explicit routeData array, otherwise busInfo.routeCities, otherwise from/to
  function getRouteArray() {
    let route = null
    if (routeData) {
      if (Array.isArray(routeData)) route = routeData
      else if (Array.isArray(routeData.routeCities)) route = routeData.routeCities
    }
    if (!route && busInfo && Array.isArray(busInfo.routeCities)) route = busInfo.routeCities
    if (!route && busInfo && busInfo.fromCity && busInfo.toCity) route = [busInfo.fromCity, ...(busInfo.intermediates || []), busInfo.toCity]
    if (!route) return null
    return route.map(r => (typeof r === 'string' ? r.trim() : String(r))).filter(Boolean)
  }

  useEffect(() => {
    let mounted = true
    if (!apiKey) {
      setGmapsLoaded(false)
      return
    }

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (!mounted) return
        setGmapsLoaded(true)

        if (!containerRef.current) return

        // init map only once
        if (!mapRef.current) {
          mapRef.current = new maps.Map(containerRef.current, {
            center: { lat: 20.5937, lng: 78.9629 },
            zoom: 6,
            disableDefaultUI: false,
          })
        }

        // init directions renderer
        if (!directionsRendererRef.current) {
          directionsRendererRef.current = new maps.DirectionsRenderer({ suppressMarkers: true })
          directionsRendererRef.current.setMap(mapRef.current)
        }

        renderRoute()
      })
      .catch(() => {
        setGmapsLoaded(false)
      })

    return () => { 
      mounted = false
      // Clean up marker on unmount
      if (busMarkerRef.current) {
        busMarkerRef.current.setMap(null)
        busMarkerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Re-render route when routeData or busInfo change
  useEffect(() => {
    if (!gmapsLoaded) return
    renderRoute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmapsLoaded, routeData, busInfo])

  function renderRoute() {
    try {
      const maps = window.google && window.google.maps
      if (!maps || !directionsRendererRef.current || !mapRef.current) return

      const route = getRouteArray()
      if (!route || route.length < 2) {
        // clear any previous directions
        directionsRendererRef.current.setDirections({ routes: [] })
        // clear bus marker
        if (busMarkerRef.current) {
          busMarkerRef.current.setMap(null)
          busMarkerRef.current = null
        }
        return
      }

      const directionsService = new maps.DirectionsService()

      const origin = route[0]
      const destination = route[route.length - 1]
      const waypoints = route.length > 2 ? route.slice(1, -1).map(loc => ({ location: loc, stopover: true })) : []

      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        },
        (result, status) => {
          if (status === maps.DirectionsStatus.OK) {
            directionsRendererRef.current.setDirections(result)

            // fit map to route bounds
            try {
              const routeBounds = result.routes[0].bounds
              mapRef.current.fitBounds(routeBounds)
            } catch (e) {
              // ignore
            }

            // Add or update bus marker with current coordinates
            if (busInfo && busInfo.lat !== undefined && busInfo.lng !== undefined && busInfo.lat !== null && busInfo.lng !== null) {
              const busLat = parseFloat(busInfo.lat)
              const busLng = parseFloat(busInfo.lng)
              
              if (!isNaN(busLat) && !isNaN(busLng)) {
                const busPosition = { lat: busLat, lng: busLng }
                
                if (!busMarkerRef.current) {
                  // Create new marker with bus icon
                  busMarkerRef.current = new maps.Marker({
                    position: busPosition,
                    map: mapRef.current,
                    title: `Bus ${busInfo.busId || 'Unknown'}`,
                    icon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
                    zIndex: 1000
                  })
                  
                  // Add info window
                  const infoWindow = new maps.InfoWindow({
                    content: `<div style="padding:8px;"><strong>${busInfo.busId || 'Bus'}</strong><br/>Lat: ${busLat.toFixed(6)}<br/>Lng: ${busLng.toFixed(6)}</div>`
                  })
                  
                  busMarkerRef.current.addListener('click', () => {
                    infoWindow.open(mapRef.current, busMarkerRef.current)
                  })
                } else {
                  // Update existing marker position
                  busMarkerRef.current.setPosition(busPosition)
                  busMarkerRef.current.setTitle(`Bus ${busInfo.busId || 'Unknown'} - Lat: ${busLat.toFixed(6)}, Lng: ${busLng.toFixed(6)}`)
                }
              }
            } else if (busMarkerRef.current) {
              // Remove marker if no coordinates
              busMarkerRef.current.setMap(null)
              busMarkerRef.current = null
            }
          } else {
            console.error('Directions request failed:', status)
          }
        }
      )
    } catch (err) {
      console.error('renderRoute error', err)
    }
  }

  const route = getRouteArray()

  // If there's no API key, show a link to open the route on Google Maps
  if (!apiKey) {
    let url = null
    if (route && route.length >= 2) {
      const origin = encodeURIComponent(route[0])
      const destination = encodeURIComponent(route[route.length - 1])
      const waypoints = route.length > 2 ? `&waypoints=${route.slice(1, -1).map(encodeURIComponent).join('|')}` : ''
      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}`
    }

    return (
      <div style={{ width: '100%', height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ padding: '12px 18px', background: '#1e88e5', color: '#fff', borderRadius: 6 }}>
            Open route in Google Maps
          </a>
        ) : (
          <div style={{ color: '#666' }}>No route available to display. Please search and select a bus.</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: 500, marginTop: 20, borderRadius: 8, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
