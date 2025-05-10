// Mapbox token
mapboxgl.accessToken = 'pk.eyJ1Ijoic3k0MjMyIiwiYSI6ImNtOTdsZWVsNzA2azkya29mYmx3bmxuZ3AifQ.IQl49ozKfheJnY-xUTRZKQ';

function setVhUnit() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
window.addEventListener('resize', setVhUnit);
setVhUnit();


let map, tradeData, worldData, chart;
let selectedCountry = null;
let hoveredCountryId = null;
let selectedFlows = new Set(['X', 'M']); // Default to show both Import and Export


document.getElementById('start-button').addEventListener('click', () => {
  const intro = document.getElementById('intro');
  intro.style.opacity = 0;
  setTimeout(() => {
    intro.style.display = 'none';
    document.querySelector('.map-section').style.display = 'block';
    setTimeout(() => map.resize(), 100);
  }, 500);
});



// Panel toggle
const controlToggle = document.getElementById("control-toggle");
const controlPanel = document.getElementById("control-panel");
const controlPanelBody = document.getElementById("control-panel-body");

controlToggle.addEventListener("click", () => {
  controlPanel.classList.toggle("collapsed");
  const isCollapsed = controlPanel.classList.contains("collapsed");
  controlToggle.textContent = isCollapsed ? "⏵" : "⏷";
  controlPanelBody.style.display = isCollapsed ? "none" : "block";
});

// Load data
Promise.all([
  fetch('data/trade.geojson').then(res => res.json()),
  fetch('data/world.geojson').then(res => res.json())
]).then(([trade, world]) => {
  trade.features.forEach(f => f.properties.amount = Number(f.properties.amount));
  tradeData = trade;
  worldData = world;
  initMap();
  populateCommoditySelect();
});

// UI Events
const yearSlider = document.getElementById('year-slider');
const yearDisplay = document.getElementById('year-display');

yearSlider.addEventListener('input', () => {
  const value = +yearSlider.value;
  const min = +yearSlider.min;
  const max = +yearSlider.max;
  const percent = (value - min) / (max - min);
  const sliderWidth = yearSlider.offsetWidth;
  const knobOffset = percent * sliderWidth;

  yearDisplay.textContent = value;
  yearDisplay.style.left = `${knobOffset}px`;

  updateMap();
  updateChart();
});


function initMap() {
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-98, 39],
    zoom: 1.5,
    projection: 'globe'
  });

  map.on('load', () => {
    map.addSource('world', { type: 'geojson', data: worldData });

    map.addLayer({
      id: 'world-borders',
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': ['match', ['get', 'ISO_A3'], 'USA', '#55AAFF', '#333'],
        'fill-opacity': 0.2
      }
    });

    map.addLayer({
      id: 'hover-outline',
      type: 'line',
      source: 'world',
      paint: {
        'line-color': '#FFFFFF',
        'line-width': 0.5
      },
      filter: ['==', 'ISO_A3', '']
    });

    map.addLayer({
      id: 'selected-country',
      type: 'fill',
      source: 'world',
      paint: {
        'fill-color': '#FFFFFF',
        'fill-opacity': 0.2
      },
      filter: ['==', 'ISO_A3', '']
    });

    updateMap();
  });

  map.on('mousemove', 'world-borders', e => {
    map.getCanvas().style.cursor = 'pointer';
    const iso = e.features[0].properties.ISO_A3;
    hoveredCountryId = iso;
    map.setFilter('hover-outline', ['==', 'ISO_A3', iso]);
  });

  map.on('mouseleave', 'world-borders', () => {
    map.getCanvas().style.cursor = '';
    hoveredCountryId = null;
    map.setFilter('hover-outline', ['==', 'ISO_A3', '']);
  });

  map.on('click', 'world-borders', e => {
    selectedCountry = e.features[0].properties.ISO_A3;
    map.setFilter('selected-country', ['==', 'ISO_A3', selectedCountry]);
    updateMap();
    updateChart();
  });
}

// Globe vs map toggle
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

function updateMap() {
  const year = parseInt(document.getElementById('year-slider').value);
  const commodity = getSelectedCommodity();


  ['exports', 'imports'].forEach(id => {
    if (map.getSource(id)) {
      map.removeLayer(id);
      map.removeSource(id);
    }
  });

  const features = tradeData.features.filter(f => {
    const p = f.properties;
    return p.year === year &&
      (commodity === 'all' || String(p.commodity) === commodity) &&
      (!selectedCountry || p.partner === selectedCountry);
  });

  const exports = {
    type: 'FeatureCollection',
    features: features.filter(f => selectedFlows.has('X') && f.properties.flow === 'X')
  };
  const imports = {
    type: 'FeatureCollection',
    features: features.filter(f => selectedFlows.has('M') && f.properties.flow === 'M')
  };

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
          100000,        0,
          1000000,       1,
          10000000,      2,
          100000000,     3,
          1000000000,    4,
          10000000000,   5,
          100000000000,  6,
          1000000000000, 7
        ],
        'line-opacity': 0.8
      }
    });
  }

  if (imports.features.length) {
    map.addSource('imports', { type: 'geojson', data: imports });
    map.addLayer({
      id: 'imports',
      type: 'line',
      source: 'imports',
      paint: {
        'line-color': '#FF55AA',
        'line-width': ['interpolate', ['linear'], ['get', 'amount'], 0, 1, 100000000, 10],
        'line-opacity': 0.6
      }
    });
  }
}

function updateChart() {
  const commodity = getSelectedCommodity();
  const country = selectedCountry;
  if (!country) return;

  const years = [...Array(8)].map((_, i) => 2017 + i);
  const exports = [], imports = [];

  years.forEach(year => {
    const relevant = tradeData.features.filter(f => {
      const p = f.properties;
      return p.year === year &&
        p.partner === country &&
        (commodity === 'all' || String(p.commodity) === commodity);
    });
    exports.push(relevant.filter(f => f.properties.flow === 'X')
      .reduce((a, b) => a + b.properties.amount, 0));
    imports.push(relevant.filter(f => f.properties.flow === 'M')
      .reduce((a, b) => a + b.properties.amount, 0));
  });

  if (chart) chart.destroy();
  const ctx = document.getElementById('trade-chart').getContext('2d');

  // Register the annotation plugin
  Chart.register(window['chartjs-plugin-annotation']);

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
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
          fill: false,
          
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `USA trade with ${country} (${getCommodityLabel(commodity)})`,
          font: {
            size: 16
          },
          color: '#fff'
        },
        legend: {
          position: 'bottom',
          labels: {
            font: {
              size: 14
            },
          color: '#ccc'
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        },
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
      scales: {
        x: {
          title: { 
            display: true,
            text: 'Year' ,
            font: {
              size: 14
            },
          color: '#ccc'
          },
          ticks: {
            font: {
              size: 12
            },
            color: '#ccc'
          },
          grid: {
            color: '#444'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Trade Amount (USD)',
            font: {
              size: 14
            },
            color: '#ccc'
          },
          ticks: {
            callback: function(value) {
              return value.toExponential(0);
            },
            font: {
              size: 12
            },
            color: '#ccc'
          },
          grid: {
            color: '#444'
          }
        }
      }
    }
  });
}

function populateCommoditySelect() {
  const container = document.getElementById('commodity-buttons');
  container.innerHTML = '';

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

  // Add "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'commodity-btn active';
  allBtn.dataset.value = 'all';
  allBtn.innerHTML = `<img src="icons/all.png" alt="All">All`;
  allBtn.addEventListener('click', () => selectCommodity('all'));
  container.appendChild(allBtn);

  // Get unique commodities from data
  const commodities = Array.from(new Set(tradeData.features.map(f => String(f.properties.commodity))));
  commodities.sort();

  // Add buttons
  commodities.forEach(commodity => {
    const label = commodityLabels[commodity] || commodity; // fallback to raw code if missing
    const btn = document.createElement('button');
    btn.className = 'commodity-btn';
    btn.dataset.value = commodity;
    btn.innerHTML = `<img src="icons/${commodity}.png" alt="${label}">${label}`;
    btn.addEventListener('click', () => selectCommodity(commodity));
    container.appendChild(btn);
  });
}


// Helper function to update active state
function selectCommodity(value) {
  document.querySelectorAll('.commodity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });

  // Update map and chart
  updateMap();
  updateChart();
}

// Helper to get currently selected commodity
function getSelectedCommodity() {
  const activeBtn = document.querySelector('.commodity-btn.active');
  return activeBtn ? activeBtn.dataset.value : 'all';
}


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

document.querySelectorAll('.flow-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const flow = btn.dataset.flow;
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

document.getElementById('commodity-select').addEventListener('change', () => {
  updateMap();
  updateChart();
});

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

document.getElementById('show-all-btn').addEventListener('click', () => {
  selectedCountry = null;
  map.setFilter('selected-country', ['==', 'ISO_A3', '']);
  updateMap();
  if (chart) chart.destroy();
});

