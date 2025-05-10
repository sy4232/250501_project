
# U.S. Trade Visualization (2013–2024)

This interactive web visualization explores the United States' international trade flows from 2013 to 2024. It provides users with a dynamic and intuitive interface to understand export and import trends, filter by commodity and country, and view data visually over time.

---

## 📊 Features

- **Interactive Map (Mapbox GL JS)**: Displays U.S. trade connections by country.
- **Animated Trade Lines**: Shows export/import flows visually using dynamic GeoJSON.
- **Multi-Year Filtering**: Filter by year range from 2013 to 2024 using a custom slider.
- **Trade Flow Toggle**: Switch between Imports, Exports, or view both simultaneously.
- **Commodity Selection**: Select trade categories using icons with labels.
- **Time-Series Plot (Chart.js)**: Displays trade values over time with a year marker.
- **Responsive Design**: Fully responsive layout and dark-themed aesthetic.
- **Intro Splash Screen**: Entry page with background image and explanation of trade importance.

---

## 📁 Folder Structure

```
project/
├── index.html             # Main HTML entry point
├── styles.css             # Custom CSS styles
├── script.js              # JavaScript logic (Mapbox, Chart.js, UI)
├── data/
│   ├── trade.geojson      # Trade line features by year, flow, and commodity
│   └── world.geojson      # Country borders
├── bgimage/
│   └── trade.png          # Intro background image
├── icons/                 # Commodity icons
└── README.md              # Project overview and setup
```

---

## 📦 Technologies Used

- [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) – interactive map rendering
- [Chart.js](https://www.chartjs.org/) – time-series chart rendering
- HTML5 / CSS3 / JavaScript (Vanilla)
- GeoJSON – spatial data format

---

## 📅 Data Source

> Trade data compiled from publicly available U.S. import/export datasets from 2013 to 2024.  
> UN Comtrade – the United Nations International Trade Statistics Database.
