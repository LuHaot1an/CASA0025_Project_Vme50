//  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//  CASA0025: Building Spatial Applications with Big Data - Group Application
//  Group: vme50
//  Title: London Growth Cost Explorer
//  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

////////////////////////////////////////////////////////////
//  Pre-processing
////////////////////////////////////////////////////////////

// =========================================================
// 1. PROJECT CONFIG
// =========================================================

var CONFIG = {
  ProjectName: 'London Growth Cost Explorer',
  StudyAreaName: 'Greater London',
  StartYear: 2017,
  EndYear: 2025,
  MapZoom: 9,
  
  // ASSETS: London boroughs + boundary
  assets: {
    boroughs: 'projects/big-data-493009/assets/london_boroughs',
    boundary: 'projects/big-data-493009/assets/greater_london_boundary'
  },
  
  // STANDARD FIELDS
  fields: {
    BoroughName: 'NAME',
    BoroughCode: 'GSS_CODE'
  },
  
  // DATASETS: 
  datasets: {
    // Dynamic World V1
    DynamicWorld: 'GOOGLE/DYNAMICWORLD/V1',
    // Harmonized Sentinel-2 MSI: MultiSpectral Instrument, Level-2A (SR)
    Sentinel2: 'COPERNICUS/S2_SR_HARMONIZED',
    // USGS Landsat 8 Level 2, Collection 2, Tier 1
    Landsat8: 'LANDSAT/LC08/C02/T1_L2',
    // USGS Landsat 9 Level 2, Collection 2, Tier 1
    Landsat9: 'LANDSAT/LC09/C02/T1_L2',
    // JRC Global Surface Water Mapping Layers, v1.4
    JRCGlobalSurfaceWater: 'JRC/GSW1_4/GlobalSurfaceWater'
  },
  
  // TIME WINDOWS
  windows: {
    // Whole project filter window
    ProjectStart: '2017-01-01',
    ProjectEnd: '2025-12-31',
    // Dynamic World target years
    dwStartYear: 2017,
    dwEndYear: 2025,
    // Sentinel-2 growing season windows
    s2StartStart: '2017-05-01',
    s2StartEnd: '2017-09-30',
    s2EndStart: '2025-05-01',
    s2EndEnd: '2025-09-30',
    // Landsat summer windows
    lstStartStart: '2017-06-01',
    lstStartEnd: '2017-08-31',
    lstEndStart: '2025-06-01',
    lstEndEnd: '2025-08-31'
  },
  
  // ANALYSIS SCALES
  scale: {
    landcover: 10,
    ndvi: 10,
    lst: 30,
    water: 30,
    summary: 30
  },
};

// =========================================================
// 2. WATER SETTINGS: 
//    stable-water baseline + water-edge sensitivity zone
// =========================================================

var WATER = {
  OccurrenceThreshold: 75, 
  SeasonalityThreshold: 10, 
  BufferMeters: 100
};

// =========================================================
// 3. LOAD ASSETS: 
//    London boroughs + boundary
// =========================================================

var boroughs = ee.FeatureCollection(CONFIG.assets.boroughs);
var boundaryFc = ee.FeatureCollection(CONFIG.assets.boundary);
var boundary = boundaryFc.geometry();

// =========================================================
// 4. LOAD DATASETS
// =========================================================

// Dynamic World V1
var dw = ee.ImageCollection(CONFIG.datasets.DynamicWorld)
  .filterBounds(boundary)
  .filterDate(CONFIG.windows.ProjectStart, CONFIG.windows.ProjectEnd);

// Harmonized Sentinel-2 MSI: MultiSpectral Instrument, Level-2A (SR)
var s2 = ee.ImageCollection(CONFIG.datasets.Sentinel2)
  .filterBounds(boundary)
  .filterDate(CONFIG.windows.ProjectStart, CONFIG.windows.ProjectEnd);

// USGS Landsat 8 Level 2, Collection 2, Tier 1
var l8 = ee.ImageCollection(CONFIG.datasets.Landsat8)
  .filterBounds(boundary)
  .filterDate('2017-01-01', '2020-12-31');

// USGS Landsat 9 Level 2, Collection 2, Tier 1
var l9 = ee.ImageCollection(CONFIG.datasets.Landsat9)
  .filterBounds(boundary)
  .filterDate('2021-01-01', '2025-12-31');
  
// JRC Global Surface Water Mapping Layers, v1.4
var jrc = ee.Image(CONFIG.datasets.JRCGlobalSurfaceWater)
  .clip(boundary);
  
// =========================================================
// 5. FUNCTIONS
// =========================================================

// ------ Dynamic World ------
// Return start/end dates for a full year
// Example: 2017 -> start: 2017-01-01, end: 2018-01-01
function getYearWindow(year) {
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  return {start: start, end: end};
}

// Build annual Dynamic World Mode
function getAnnualDwMode(year, region) {
  var yearWindow = getYearWindow(year);

  var annualCol = dw
    .filterDate(yearWindow.start, yearWindow.end)
    .filterBounds(region)
    .select('label');
    
  var annualMode = annualCol
    .mode()
    .rename('label')
    .clip(region);

  return annualMode;
}

// ------ Sentinel-2 ------
// Sentinel-2 cloud mask using QA60 
// baseline mask for setup and preview
// B can refine later
function maskS2Clouds(img) {
  var qa = img.select('QA60');
  
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return ee.Image(
    img.updateMask(mask)
    .copyProperties(img, img.propertyNames())
  );
}

// Add NDVI band to Sentinel-2 image
// NDVI = (B8 - B4) / (B8 + B4)
function addS2Ndvi(img) {
  var ndvi = img.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return img.addBands(ndvi);
}

// Build Sentinel-2 median composite for a given time window
function getS2Composite(startDate, endDate, region) {
  return s2
    .filterDate(startDate, endDate)
    .filterBounds(region)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 50))
    .map(function(img){
      var masked = ee.Image(maskS2Clouds(img)).select(['B2', 'B3', 'B4', 'B8']).divide(10000);
      var ndvi = masked.normalizedDifference(['B8', 'B4']).rename('NDVI');
      return masked.addBands(ndvi);
    })
    .median()
    .clip(region);
}
// ------ Landsat ------
// Landsat Collection 2 QA mask
function maskLandsatL2(img) {
  var qa = img.select('QA_PIXEL');

  var fill = qa.bitwiseAnd(1 << 0).neq(0);
  var dilatedCloud = qa.bitwiseAnd(1 << 1).neq(0);
  var cirrus = qa.bitwiseAnd(1 << 2).neq(0);
  var cloud = qa.bitwiseAnd(1 << 3).neq(0);
  var cloudShadow = qa.bitwiseAnd(1 << 4).neq(0);
  var snow = qa.bitwiseAnd(1 << 5).neq(0);

  var mask = fill.not()
    .and(dilatedCloud.not())
    .and(cirrus.not())
    .and(cloud.not())
    .and(cloudShadow.not())
    .and(snow.not());

  return img.updateMask(mask)
    .copyProperties(img, img.propertyNames());
}

// Apply scaling factors
function scaleLandsatL2(img) {
  var optical = img.select(['SR_B2', 'SR_B3', 'SR_B4'])
    .multiply(0.0000275)
    .add(-0.2);
  var thermal = img.select('ST_B10')
    .multiply(0.00341802)
    .add(149.0)
    .rename('LST_K'); // land surface temperature (Kelvin)

  return img.addBands(optical, null, true)
    .addBands(thermal, null, true);
}

// Build merged Landsat 8 + 9 summer collection for a given time window
function getMergedLandsatCollection(startDate, endDate, region) {
  var l8Window = l8
    .filterDate(startDate, endDate)
    .filterBounds(region)
    .map(maskLandsatL2)
    .map(scaleLandsatL2);

  var l9Window = l9
    .filterDate(startDate, endDate)
    .filterBounds(region)
    .map(maskLandsatL2)
    .map(scaleLandsatL2);

  return l8Window.merge(l9Window);
}

// Build Landsat median composite for a given time window
function getLandsatComposite(startDate, endDate, region) {
  return getMergedLandsatCollection(startDate, endDate, region)
    .median()
    .clip(region);
}

// =========================================================
// 6. BUILD PREVIEW 
// =========================================================

// ------ Dynamic World annual mode images ------
var dw2017 = getAnnualDwMode(CONFIG.windows.dwStartYear, boundary);
var dw2025 = getAnnualDwMode(CONFIG.windows.dwEndYear, boundary);

// ------ Sentinel-2 growing season composites ------
var s2_2017 = getS2Composite(
  CONFIG.windows.s2StartStart,
  CONFIG.windows.s2StartEnd,
  boundary
);

var s2_2025 = getS2Composite(
  CONFIG.windows.s2EndStart,
  CONFIG.windows.s2EndEnd,
  boundary
);

// ------ Landsat summer composites ------
var landsat_2017 = getLandsatComposite(
  CONFIG.windows.lstStartStart,
  CONFIG.windows.lstStartEnd,
  boundary
);

var landsat_2025 = getLandsatComposite(
  CONFIG.windows.lstEndStart,
  CONFIG.windows.lstEndEnd,
  boundary
);

// ------ JRC stable-water baseline ------
var waterOccurrence = jrc.select('occurrence');
var waterSeasonality = jrc.select('seasonality');

var stableWaterBinary = waterOccurrence.gte(WATER.OccurrenceThreshold)
  .and(waterSeasonality.gte(WATER.SeasonalityThreshold))
  .rename('stable_water_binary');

var stableWater = stableWaterBinary
  .selfMask()
  .rename('stable_water');

var stableWaterBuffer100m = stableWaterBinary
  .unmask(0)
  .focal_max({
    radius: WATER.BufferMeters,
    units: 'meters'
  })
  .selfMask()
  .rename('stable_water_buffer_100m');

var waterEdgeZone100m = stableWaterBuffer100m
  .updateMask(stableWaterBuffer100m.and(stableWaterBinary.not()))
  .rename('water_edge_zone_100m');

// =========================================================
// 7. VISUALIZATION SETTINGS
// =========================================================

var dwPalette = [
  '419bdf', // water
  '397d49', // trees
  '88b053', // grass
  '7a87c6', // flooded vegetation
  'e49635', // crops
  'dfc35a', // shrub and scrub
  'c4281b', // built
  'a59b8f', // bare
  'b39fe1'  // snow and ice
];

var viz = {
  boroughs: {color: 'blue'},
  boundary: {color: 'green'},

  dw: {
    min: 0,
    max: 8,
    palette: dwPalette
  },

  s2Rgb: {
    bands: ['B4', 'B3', 'B2'],
    min: 0.02,
    max: 0.30
  },

  ndvi: {
    bands: ['NDVI'],
    min: 0,
    max: 1,
    palette: ['#f7fcf5', '#74c476', '#00441b']
  },

  landsatRgb: {
    bands: ['SR_B4', 'SR_B3', 'SR_B2'],
    min: 0.02,
    max: 0.30
  },

  lst: {
    bands: ['LST_K'],
    min: 285,
    max: 315,
    palette: ['#fff5f0', '#fcae91', '#fb6a4a', '#cb181d']
  },

  stableWater: {
    palette: ['#08519c']
  },

  waterEdge: {
    palette: ['#6baed6']
  }
};

// =========================================================
// 8. MAP DISPLAY
// =========================================================

Map.centerObject(boundary, CONFIG.MapZoom);

// Core boundaries
Map.addLayer(boundaryFc, viz.boundary, 'greater_london_boundary', true);
Map.addLayer(boroughs, viz.boroughs, 'london_boroughs', false);

// Dynamic World previews
Map.addLayer(dw2017, viz.dw, 'dw_2017_mode', false);
Map.addLayer(dw2025, viz.dw, 'dw_2025_mode', false);

// Sentinel-2 previews
Map.addLayer(s2_2017, viz.s2Rgb, 's2_2017_rgb', false);
Map.addLayer(s2_2025, viz.s2Rgb, 's2_2025_rgb', false);
Map.addLayer(s2_2017.select('NDVI'), viz.ndvi, 'ndvi_2017_preview', false);
Map.addLayer(s2_2025.select('NDVI'), viz.ndvi, 'ndvi_2025_preview', false);

// Landsat previews
Map.addLayer(landsat_2017, viz.landsatRgb, 'landsat_2017_rgb', false);
Map.addLayer(landsat_2025, viz.landsatRgb, 'landsat_2025_rgb', false);
Map.addLayer(landsat_2017.select('LST_K'), viz.lst, 'lst_2017_preview', false);
Map.addLayer(landsat_2025.select('LST_K'), viz.lst, 'lst_2025_preview', false);

// Water previews
Map.addLayer(stableWater, viz.stableWater, 'stable_water_preview', false);
Map.addLayer(waterEdgeZone100m, viz.waterEdge, 'water_edge_zone_100m', false);

