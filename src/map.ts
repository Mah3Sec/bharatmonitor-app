import maplibregl from 'maplibre-gl'
import type { StateData } from '../types'
import { STATE_MAP, GEO_NAME_MAP } from '../data/states'

// India GeoJSON source (public domain, ~400KB)
const INDIA_GEOJSON = 'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson'

// Color scale: low issues → teal, high issues → red
function issueColor(issues: number): string {
  if (issues > 12000) return '#7a1520'  // deep red
  if (issues > 8000)  return '#a33020'  // red-orange
  if (issues > 5000)  return '#8a5010'  // amber
  if (issues > 2000)  return '#2a6040'  // teal-green
  if (issues > 500)   return '#1a4060'  // ocean blue
  return '#0f2035'                       // dark (no data)
}

function hoverColor(_issues: number): string {
  return '#2a4a7a'
}

export function initMap(
  container: string,
  onStateClick: (name: string, data: StateData | null) => void
): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: {
      version: 8,
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© CartoDB © OSM',
          maxzoom: 19,
        },
      },
      layers: [{
        id: 'background',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 22,
      }],
    },
    center: [82.5, 22.5],
    zoom: 4.5,
    minZoom: 3,
    maxZoom: 10,
    attributionControl: false,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

  map.on('load', () => {
    // Load India GeoJSON
    map.addSource('india-states', {
      type: 'geojson',
      data: INDIA_GEOJSON as unknown as GeoJSON.FeatureCollection,
      promoteId: 'NAME_1',  // use state name as feature ID for hover state
    })

    // Build fill color expression from state data
    const colorExpression: maplibregl.DataDrivenPropertyValueSpecification<string> = [
      'match',
      ['get', 'NAME_1'],
      ...buildColorStops(),
      '#0f2035',  // default / unknown
    ]

    // State fill layer
    map.addLayer({
      id: 'states-fill',
      type: 'fill',
      source: 'india-states',
      paint: {
        'fill-color': colorExpression,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.88,
          0.72
        ],
      },
    })

    // State border layer
    map.addLayer({
      id: 'states-border',
      type: 'line',
      source: 'india-states',
      paint: {
        'line-color': '#1e3a5f',
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 2,
          ['boolean', ['feature-state', 'hover'], false], 1.5,
          0.8
        ],
        'line-opacity': 0.9,
      },
    })

    // Hover highlight layer (separate for glow effect)
    map.addLayer({
      id: 'states-hover',
      type: 'fill',
      source: 'india-states',
      paint: {
        'fill-color': '#3a6aaa',
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.2,
          0
        ],
      },
    })

    // Labels for states with >5000 issues
    map.addLayer({
      id: 'states-labels',
      type: 'symbol',
      source: 'india-states',
      layout: {
        'text-field': ['get', 'NAME_1'],
        'text-font': ['Open Sans Regular'],
        'text-size': 10,
        'text-max-width': 8,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#8aa8c8',
        'text-halo-color': '#050d1a',
        'text-halo-width': 1,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0, 5.5, 1],
      },
    })

    // Set up hover interactions
    let hoveredId: string | null = null
    let selectedId: string | null = null

    map.on('mousemove', 'states-fill', (e) => {
      if (e.features && e.features.length > 0) {
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'india-states', id: hoveredId }, { hover: false })
        }
        hoveredId = e.features[0].id as string
        map.setFeatureState({ source: 'india-states', id: hoveredId }, { hover: true })
        map.getCanvas().style.cursor = 'pointer'
      }
    })

    map.on('mouseleave', 'states-fill', () => {
      if (hoveredId !== null) {
        map.setFeatureState({ source: 'india-states', id: hoveredId }, { hover: false })
        hoveredId = null
      }
      map.getCanvas().style.cursor = ''
    })

    map.on('click', 'states-fill', (e) => {
      if (!e.features || e.features.length === 0) return
      const geoName = e.features[0].properties?.NAME_1 as string
      const ourName = GEO_NAME_MAP[geoName] || geoName
      const stateData = STATE_MAP[ourName] || null

      // Update selected highlight
      if (selectedId !== null) {
        map.setFeatureState({ source: 'india-states', id: selectedId }, { selected: false })
      }
      selectedId = e.features[0].id as string
      map.setFeatureState({ source: 'india-states', id: selectedId }, { selected: true })

      onStateClick(ourName, stateData)
    })
  })

  return map
}

// Build [state_name, color, state_name, color, ...] pairs for match expression
function buildColorStops(): (string | number | boolean | null)[] {
  const stops: (string | number | boolean | null)[] = []
  for (const [name, data] of Object.entries(STATE_MAP)) {
    stops.push(name, issueColor(data.issues))
  }
  // Also add GEO aliases
  for (const [geoName, ourName] of Object.entries(GEO_NAME_MAP)) {
    if (STATE_MAP[ourName]) {
      stops.push(geoName, issueColor(STATE_MAP[ourName].issues))
    }
  }
  return stops
}

// Add issue dot markers to the map
export function addIssueMarkers(
  map: maplibregl.Map,
  issues: Array<{ id: string; title: string; lat: number; lng: number; severity: string; category: string }>
): void {
  const catColor: Record<string, string> = {
    roads: '#FF7518', water: '#00B4D8', power: '#FFD700', health: '#FF4455', corrupt: '#00E5CC'
  }
  const sevSize: Record<string, number> = {
    emergency: 14, critical: 12, high: 10, medium: 8, low: 6
  }

  issues.forEach(issue => {
    const size = sevSize[issue.severity] || 8
    const color = catColor[issue.category] || '#aaa'

    const el = document.createElement('div')
    el.style.cssText = `
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};
      border:2px solid ${color}88;
      box-shadow:0 0 ${size}px ${color}66;
      cursor:pointer;
    `

    new maplibregl.Marker({ element: el })
      .setLngLat([issue.lng, issue.lat])
      .setPopup(new maplibregl.Popup({ offset: 12, closeButton: false })
        .setHTML(`
          <div style="font-family:'DM Sans',sans-serif;font-size:12px;color:#dde8f5;padding:4px;max-width:220px">
            <span style="color:${color};font-size:11px;font-weight:600;text-transform:uppercase">${issue.category}</span>
            <div style="margin-top:4px;line-height:1.4">${issue.title}</div>
          </div>
        `))
      .addTo(map)
  })
}
