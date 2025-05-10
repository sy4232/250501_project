// Set your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3k0MjMyIiwiYSI6ImNtOTdsZWVsNzA2azkya29mYmx3bmxuZ3AifQ.IQl49ozKfheJnY-xUTRZKQ';

// --- Responsive height unit (for mobile viewports) ---
function setVhUnit() {
  // Set custom --vh unit to 1% of current viewport height
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
window.addEventListener('resize', setVhUnit); // Update on resize
setVhUnit(); // Initial run

// --- Global variables ---
let map, tradeData, worldData, chart;
let selectedCountry = null;
let hoveredCountryId = null;
let selectedFlows = new Set(['X', 'M']); // Show both imports (M) and exports (X) by default

// --- Handle intro screen transition ---
document.getElementById('start-button').addEventListener('click', () => {
  const intro = document.getElementById('intro');
  intro.style.opacity = 0; // Fade out
  setTimeout(() => {
    intro.style.display = 'none'; // Hide after fade
    document.querySelector('.map-section').style.display = 'block'; // Show map section
    setTimeout(() => map.resize(), 100); // Resize map to fit new layout
  }, 500);
});

// --- Make control panel draggable ---
function makePanelDraggable(panel) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const header = panel.querySelector('.panel-toggle');
  header.style.cursor = 'move';

  // Mouse down: Start drag
  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = 'none'; // Prevent text selection during drag
  });

  // Mouse move: Update position
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const left = e.clientX - offsetX;
      const top = e.clientY - offsetY;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
  });

  // Mouse up: Stop dragging
  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = ''; // Re-enable text selection
  });
}

// Initialize drag on page load
document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('control-panel');
  makePanelDraggable(panel);
});

// --- Load GeoJSON data ---
Promise.all([
  fetch('data/trade.geojson').then(res => res.json()),
  fetch('data/world.geojson').then(res => res.json())
]).then(([trade, world]) => {
  trade.features.forEach(f => f.properties.amount = Number(f.properties.amount)); // Parse trade amounts
  tradeData = trade;
  worldData = world;
  initMap();                // Initialize Mapbox map
  populateCommoditySelect(); // Create commodity buttons
});

// --- Year slider UI logic ---
const yearSlider = document.getElementById('year-slider');
const yearDisplay = document.getElementById('year-display');

yearSlider.addEventListener('input', () => {
  const value = yearSlider.value;
  const min = yearSlider.min;
  const max = yearSlider.max;
  const percent = (value - min) / (max - min);
  const sliderWidth = yearSlider.offsetWidth;
  const knobOffset = percent * sliderWidth;

  yearDisplay.textContent = value;
  yearDisplay.style.left = `${knobOffset}px`;

  updateMap();   // Redraw trade lines
  updateChart(); // Update line chart
});

// --- Initialize Mapbox map and layers ---
function initMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-98, 39], // Center of U.S.
    zoom: 1.5,
    projection: 'globe'
  });

  map.on('load', () => {
    // Add base world layer
    map.addSource('world', { type: 'geojson', data: worldData });

    // Fill layer for country borders
    map.addLayer({
      id: 'world-borders',
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': ['match', ['get', 'ISO_A3'], 'USA', '#55AAFF', '#333'], // USA = blue
        'fill-opacity': 0.2
      }
    });

    // Outline for hovered country
    map.addLayer({
      id: 'hover-outline',
      type: 'line',
      source: 'world',
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 0.5
      },
      filter: ['==', 'ISO_A3', ''] // Empty filter initially
    });

    // Fill layer for selected country
    map.addLayer({
      id: 'selected-country',
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': '#FFFFFF',
        'fill-opacity': 0.2
      },
      filter: ['==', 'ISO_A3', ''] // No country selected initially
    });

    updateMap(); // Draw initial trade data
  });

  // Hover behavior
  map.on('mousemove', 'world-borders', e => {
    map.getCanvas().style.cursor = 'pointer';
    const iso = e.features[0].properties.ISO_A3;
    hoveredCountryId = iso;
    map.setFilter('hover-outline', ['==', 'ISO_A3', iso]);
  });

  // Leave hover
  map.on('mouseleave', 'world-borders', () => {
    map.getCanvas().style.cursor = '';
    hoveredCountryId = null;
    map.setFilter('hover-outline', ['==', 'ISO_A3', '']);
  });

  // Select country on click
  map.on('click', 'world-borders', e => {
    selectedCountry = e.features[0].properties.ISO_A3;
    map.setFilter('selected-country', ['==', 'ISO_A3', selectedCountry]);
    document.getElementById('plot-placeholder').style.display = 'none';
    updateMap();
    updateChart();
  });
}

// --- Toggle between globe and flat map projections ---
document.getElementById('globe-view').addEventListener('click', () => {
  map.setProjection('globe');
  document.getElementById('globe-view').classList.add('active');
  document.getElementById('map-view').classList.remove('active');
});

document.getElementById('map-view').addEventListener('click', () => {
  map.setProjection('mercator');
  document.getElementById('map-view').classList.add('active');
  document.getElementById('globe-view').classList.remove('active');
});

// --- Filter and update map trade lines ---
function updateMap() {
  const year = parseInt(document.getElementById('year-slider').value);
  const commodity = getSelectedCommodity();

  // Remove old trade lines
  ['exports', 'imports'].forEach(id => {
    if (map.getSource(id)) {
      map.removeLayer(id);
      map.removeSource(id);
    }
  });

  // Filter relevant features for year, commodity, and country
  const features = tradeData.features.filter(f => {
    const p = f.properties;
    return p.year === year &&
      (commodity === 'all' || String(p.commodity) === commodity) &&
      (!selectedCountry || p.partner === selectedCountry);
  });

  // Separate exports and imports
  const exports = {
    type: 'FeatureCollection',
    features: features.filter(f => selectedFlows.has('X') && f.properties.flow === 'X')
  };
  const imports = {
    type: 'FeatureCollection',
    features: features.filter(f => selectedFlows.has('M') && f.properties.flow === 'M')
  };

  // Add exports layer
  if (exports.features.length) {
    map.addSource('exports', { type: 'geojson', data: exports });
    map.addLayer({
      id: 'exports',
      type: 'line',
      source: 'exports',
      paint: {
        'line-color': '#00FFAA',
        'line-width': [
          'interpolate', ['linear'], ['get', 'amount'],
          1000000, 1,
          10000000, 2,
          100000000, 3,
          1000000000, 4,
          10000000000, 5,
          100000000000, 6,
          1000000000000, 7
        ],
        'line-opacity': 0.8
      }
    });
  }

  // Add imports layer
  if (imports.features.length) {
    map.addSource('imports', { type: 'geojson', data: imports });
    map.addLayer({
      id: 'imports',
      type: 'line',
      source: 'imports',
      paint: {
        'line-color': '#FF55AA',
        'line-width': ['interpolate', ['linear'], ['get', 'amount'],
          1000000, 1,
          10000000, 2,
          100000000, 3,
          1000000000, 4,
          10000000000, 5,
          100000000000, 6,
          1000000000000, 7
        ],
        'line-opacity': 0.8
      }
    });
  }
}

// Update the Chart.js line chart based on current selections
function updateChart() {
  const commodity = getSelectedCommodity(); // Get selected commodity code
  const country = selectedCountry; // Get selected country
  if (!country) return; // Exit if no country selected

  // Define range of years (2017–2024)
  const years = [...Array(8)].map((_, i) => 2017 + i);
  const exports = [], imports = [];

  // Loop through each year to calculate total export/import amounts
  years.forEach(year => {
    // Filter trade data by year, country, and commodity
    const relevant = tradeData.features.filter(f => {
      const p = f.properties;
      return p.year === year &&
        p.partner === country &&
        (commodity === 'all' || String(p.commodity) === commodity);
    });

    // Sum export (flow === 'X') and import (flow === 'M') values for the year
    exports.push(
      relevant.filter(f => f.properties.flow === 'X')
        .reduce((a, b) => a + b.properties.amount, 0)
    );
    imports.push(
      relevant.filter(f => f.properties.flow === 'M')
        .reduce((a, b) => a + b.properties.amount, 0)
    );
  });

  // Destroy existing chart before re-rendering
  if (chart) chart.destroy();
  const ctx = document.getElementById('trade-chart').getContext('2d');

  // Register Chart.js annotation plugin
  Chart.register(window['chartjs-plugin-annotation']);

  // Create new chart
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years, // X-axis: years
      datasets: [
        {
          label: 'Export',
          data: exports,
          borderColor: '#00FFAA',
          fill: false,
          spanGaps: false
        },
        {
          label: 'Import',
          data: imports,
          borderColor: '#FF55AA',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        // Chart title
        title: {
          display: true,
          text: `USA trade with ${country} (${getCommodityLabel(commodity)})`,
          font: { size: 16 },
          color: '#fff'
        },
        // Legend configuration
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 14 },
            color: '#ccc'
          }
        },
        // Tooltip configuration
        tooltip: {
          mode: 'index',
          intersect: false
        },
        // Vertical line annotation for selected year
        annotation: {
          annotations: {
            selectedYearLine: {
              type: 'dotted',
              borderColor: '#FFFFFF',
              borderDash: [2, 2],
              borderWidth: 1,
              scaleID: 'x',
              value: years.indexOf(parseInt(document.getElementById('year-slider').value))
            }
          }
        }
      },
      // Axis styles
      scales: {
        x: {
          title: {
            display: true,
            text: 'Year',
            font: { size: 14 },
            color: '#ccc'
          },
          ticks: {
            font: { size: 12 },
            color: '#ccc'
          },
          grid: { color: '#444' }
        },
        y: {
          title: {
            display: true,
            text: 'Trade Amount (USD)',
            font: { size: 14 },
            color: '#ccc'
          },
          ticks: {
            callback: function (value) {
              return value.toExponential(0); // Show in scientific notation
            },
            font: { size: 12 },
            color: '#ccc'
          },
          grid: { color: '#444' }
        }
      }
    }
  });
}

// Dynamically populate commodity icon buttons from trade data
function populateCommoditySelect() {
  const container = document.getElementById('commodity-buttons');
  container.innerHTML = ''; // Clear existing buttons

  // Mapping of commodity codes to labels
  const commodityLabels = {
    '85': 'Electronics',
    '87': 'Vehicles',
    '2': 'Meat',
    '27': 'Oil',
    '30': 'Pharmaceuticals',
    '12': 'Seeds and Fruits',
    '71': 'Gemstones',
    '61': 'Apparel',
    'all': 'All'
  };

  // Add "All" commodity button first
  const allBtn = document.createElement('button');
  allBtn.className = 'commodity-btn active';
  allBtn.dataset.value = 'all';
  allBtn.innerHTML = `<img src="icons/all.png" alt="All">All`;
  allBtn.addEventListener('click', () => selectCommodity('all'));
  container.appendChild(allBtn);

  // Get unique commodity codes from data
  const commodities = Array.from(new Set(tradeData.features.map(f => String(f.properties.commodity))));
  commodities.sort();

  // Add button for each commodity
  commodities.forEach(commodity => {
    const label = commodityLabels[commodity] || commodity; // Fallback to code if label missing
    const btn = document.createElement('button');
    btn.className = 'commodity-btn';
    btn.dataset.value = commodity;
    btn.innerHTML = `<img src="icons/${commodity}.png" alt="${label}">${label}`;
    btn.addEventListener('click', () => selectCommodity(commodity));
    container.appendChild(btn);
  });
}

// Highlight selected commodity and update map/chart
function selectCommodity(value) {
  document.querySelectorAll('.commodity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });

  updateMap();   // Update Mapbox map
  updateChart(); // Update Chart.js chart
}

// Get value of currently selected commodity
function getSelectedCommodity() {
  const activeBtn = document.querySelector('.commodity-btn.active');
  return activeBtn ? activeBtn.dataset.value : 'all';
}

// Convert commodity code to readable label
function getCommodityLabel(code) {
  const map = {
    '85': 'Electronics',
    '87': 'Vehicles',
    '2': 'Meat',
    '27': 'Oil',
    '30': 'Pharmaceuticals',
    '12': 'Seeds and fruits',
    '71': 'Gemstones',
    '61': 'Apparel',
    'all': 'All'
  };
  return map[code] || code;
}

// Add click event to flow toggle buttons (Import/Export)
document.querySelectorAll('.flow-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const flow = btn.dataset.flow;
    // Toggle active state and inclusion in selectedFlows set
    if (selectedFlows.has(flow)) {
      selectedFlows.delete(flow);
      btn.classList.remove('active');
    } else {
      selectedFlows.add(flow);
      btn.classList.add('active');
    }
    updateMap();
    updateChart();
  });
});

// Update chart/map on select change (used as fallback)
document.getElementById('commodity-select').addEventListener('change', () => {
  updateMap();
  updateChart();
});

// Switch to globe projection view
document.getElementById('globe-view').addEventListener('click', () => {
  map.setProjection('globe');
  document.getElementById('globe-view').classList.add('active');
  document.getElementById('map-view').classList.remove('active');
});

// Switch to flat map projection view
document.getElementById('map-view').addEventListener('click', () => {
  map.setProjection('mercator');
  document.getElementById('map-view').classList.add('active');
  document.getElementById('globe-view').classList.remove('active');
});

// Reset selected country and clear chart
document.getElementById('show-all-btn').addEventListener('click', () => {
  selectedCountry = null; // Clear selected country
  map.setFilter('selected-country', ['==', 'ISO_A3', '']); // Remove filter
  updateMap(); // Refresh map
  if (chart) chart.destroy(); // Remove chart
});
