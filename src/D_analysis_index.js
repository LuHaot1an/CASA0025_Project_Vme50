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
    boroughs: 'projects/london-growth-cost-explorer/assets/london_boroughs',
    boundary: 'projects/london-growth-cost-explorer/assets/greater_london_boundary'
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

// =========================================================
// 9. B STAGE: CLEAN DATA PRODUCTS FOR MEMBERS C & D
//    - Route A support: Random-Forest-ready dataset
// =========================================================

var B_CONFIG = {
  ExportPrefix: 'vme50_london_growth_',
  DoExport: false, // Set true when you are ready to run export tasks.

  // Class IDs from Dynamic World label band.
  dwClass: {
    water: 0,
    trees: 1,
    grass: 2,
    floodedVegetation: 3,
    crops: 4,
    shrub: 5,
    built: 6,
    bare: 7,
    snowIce: 8
  },

  // Classes treated as "green/open" baseline for opportunity cost.
  greenLikeClasses: [1, 2, 4, 5],

  // Random forest sample controls.
  rf: {
    pointsPerClass: 3000,
    seed: 42,
    trainRatio: 0.7
  }
};

// Normalization helper for 0-1 score with guard.
function normalize01(img, minVal, maxVal) {
  var minNum = ee.Number(minVal);
  var maxNum = ee.Number(maxVal);
  var den = maxNum.subtract(minNum);
  return img.subtract(minNum).divide(den).clamp(0, 1);
}

function celsiusFromKelvin(kImg) {
  return kImg.subtract(273.15).rename('LST_C');
}

// ---------- 9.1 Core change masks ----------
var built2017 = dw2017.eq(B_CONFIG.dwClass.built).rename('built_2017');
var built2025 = dw2025.eq(B_CONFIG.dwClass.built).rename('built_2025');

var newBuiltMask = built2025.and(built2017.not()).rename('new_built_2017_2025');
var persistedBuiltMask = built2025.and(built2017).rename('persisted_built');

var previousClass = dw2017.updateMask(newBuiltMask).rename('previous_dw_class');
var transitionCode = dw2017.multiply(10).add(dw2025)
  .updateMask(newBuiltMask)
  .rename('dw_transition_code');

var greenLike2017 = dw2017.remap(
  B_CONFIG.greenLikeClasses,
  [1, 1, 1, 1],
  0
).rename('greenlike_2017');

var greenLossMask = greenLike2017.eq(1).and(newBuiltMask).rename('green_loss_to_built');
var waterEdgePressureMask = newBuiltMask.and(waterEdgeZone100m.unmask(0).eq(1))
  .rename('new_built_in_water_edge_zone');

// ---------- 9.2 Environment penalty layers ----------
var ndvi2017 = s2_2017.select('NDVI').rename('NDVI_2017');
var ndvi2025 = s2_2025.select('NDVI').rename('NDVI_2025');
var ndviDelta = ndvi2025.subtract(ndvi2017).rename('NDVI_delta_2025_minus_2017');
var ndviLossForNewBuilt = ndvi2017.subtract(ndvi2025)
  .max(0)
  .updateMask(newBuiltMask)
  .rename('NDVI_loss_on_new_built');

var lst2017K = landsat_2017.select('LST_K').rename('LST_2017_K');
var lst2025K = landsat_2025.select('LST_K').rename('LST_2025_K');
var lstDeltaK = lst2025K.subtract(lst2017K).rename('LST_delta_K_2025_minus_2017');
var lstPenaltyOnNewBuilt = lstDeltaK.max(0)
  .updateMask(newBuiltMask)
  .rename('LST_penalty_K_on_new_built');

// A clean 0-1 composite "growth cost index" for C/D.
var ndviLossNorm = normalize01(ndviLossForNewBuilt.unmask(0), 0, 0.6).rename('NDVI_loss_norm');
var lstPenaltyNorm = normalize01(lstPenaltyOnNewBuilt.unmask(0), 0, 6).rename('LST_penalty_norm');
var waterPenalty = waterEdgePressureMask.unmask(0).rename('water_edge_penalty_binary');
var greenPenalty = greenLossMask.unmask(0).rename('green_loss_penalty_binary');

var growthCostIndex = ndviLossNorm.multiply(0.35)
  .add(lstPenaltyNorm.multiply(0.35))
  .add(waterPenalty.multiply(0.20))
  .add(greenPenalty.multiply(0.10))
  .updateMask(newBuiltMask)
  .rename('growth_cost_index');

// ---------- 9.3 Member C/D ready raster stack ----------
// This stack is designed for direct map layer usage + downstream summary.
var cAndDStack = ee.Image.cat([
  newBuiltMask,
  persistedBuiltMask,
  previousClass,
  transitionCode,
  greenLossMask,
  waterEdgePressureMask,
  ndvi2017,
  ndvi2025,
  ndviDelta,
  lst2017K,
  lst2025K,
  lstDeltaK,
  growthCostIndex
]).clip(boundary);

// ---------- 9.4 Borough-level clean summary table ----------
function buildBoroughSummary(feature) {
  var region = feature.geometry();

  var areaImage = ee.Image.pixelArea().rename('pixel_area');
  var newBuiltAreaM2 = areaImage.updateMask(newBuiltMask).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: CONFIG.scale.summary,
    maxPixels: 1e13
  }).get('pixel_area');

  var greenLossAreaM2 = areaImage.updateMask(greenLossMask).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: CONFIG.scale.summary,
    maxPixels: 1e13
  }).get('pixel_area');

  var waterEdgePressureAreaM2 = areaImage.updateMask(waterEdgePressureMask).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: region,
    scale: CONFIG.scale.summary,
    maxPixels: 1e13
  }).get('pixel_area');

  var meanNdviLoss = ndviLossForNewBuilt.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: CONFIG.scale.ndvi,
    maxPixels: 1e13
  }).get('NDVI_loss_on_new_built');

  var meanLstPenalty = lstPenaltyOnNewBuilt.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: CONFIG.scale.lst,
    maxPixels: 1e13
  }).get('LST_penalty_K_on_new_built');

  var meanCost = growthCostIndex.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: region,
    scale: CONFIG.scale.summary,
    maxPixels: 1e13
  }).get('growth_cost_index');

  return feature.set({
    new_built_area_km2: ee.Number(newBuiltAreaM2).divide(1e6),
    green_loss_area_km2: ee.Number(greenLossAreaM2).divide(1e6),
    water_edge_pressure_area_km2: ee.Number(waterEdgePressureAreaM2).divide(1e6),
    mean_ndvi_loss_on_new_built: meanNdviLoss,
    mean_lst_penalty_k_on_new_built: meanLstPenalty,
    mean_growth_cost_index: meanCost
  });
}

var boroughSummary = boroughs.map(buildBoroughSummary);

// ---------- 9.5 Random-Forest-ready training dataset ----------
// label_rf: 1 = new built-up; 0 = not-new-built.
var rfFeatureStack = ee.Image.cat([
  s2_2025.select(['B2', 'B3', 'B4', 'B8']),
  ndvi2017,
  ndvi2025,
  ndviDelta,
  celsiusFromKelvin(lst2017K),
  celsiusFromKelvin(lst2025K),
  lstDeltaK,
  waterOccurrence.rename('water_occurrence'),
  stableWaterBuffer100m.unmask(0).rename('stable_water_buffer_100m_binary'),
  dw2017.rename('dw_label_2017')
]).clip(boundary);

var rfLabel = newBuiltMask.unmask(0).rename('label_rf');
var rfSamplingImage = rfFeatureStack.addBands(rfLabel);

var positiveSamples = rfSamplingImage.stratifiedSample({
  numPoints: B_CONFIG.rf.pointsPerClass,
  classBand: 'label_rf',
  classValues: [1],
  classPoints: [B_CONFIG.rf.pointsPerClass],
  region: boundary,
  scale: 30,
  seed: B_CONFIG.rf.seed,
  geometries: true
});

var negativeSamples = rfSamplingImage.stratifiedSample({
  numPoints: B_CONFIG.rf.pointsPerClass,
  classBand: 'label_rf',
  classValues: [0],
  classPoints: [B_CONFIG.rf.pointsPerClass],
  region: boundary,
  scale: 30,
  seed: B_CONFIG.rf.seed + 1,
  geometries: true
});

var rfSamples = positiveSamples.merge(negativeSamples)
  .randomColumn('split_random', B_CONFIG.rf.seed);

var rfTrainSamples = rfSamples.filter(ee.Filter.lt('split_random', B_CONFIG.rf.trainRatio));
var rfTestSamples = rfSamples.filter(ee.Filter.gte('split_random', B_CONFIG.rf.trainRatio));

// ---------- 9.6 QC quick checks ----------
print('Borough summary table (for C/D):', boroughSummary.limit(5));
print('RF train sample count:', rfTrainSamples.size());
print('RF test sample count:', rfTestSamples.size());

// ---------- 9.7 Extra map layers for QA ----------
Map.addLayer(newBuiltMask.selfMask(), {palette: ['#d7301f']}, 'new_built_2017_2025', true);
Map.addLayer(greenLossMask.selfMask(), {palette: ['#31a354']}, 'green_loss_to_built', false);
Map.addLayer(waterEdgePressureMask.selfMask(), {palette: ['#3182bd']}, 'water_edge_pressure_built', false);
Map.addLayer(persistedBuiltMask.selfMask(), {palette: ['#636363']}, 'persisted_built', false);
Map.addLayer(previousClass, viz.dw, 'previous_dw_class', false);
Map.addLayer(transitionCode, {min: 0, max: 88, palette: ['#f7fbff', '#6baed6', '#08306b']}, 'dw_transition_code', false);
Map.addLayer(newBuiltMask.and(waterEdgePressureMask).selfMask(), {palette: ['#08519c']}, 'new_built_in_water_edge_zone', false);
Map.addLayer(ndviDelta, {min: -0.4, max: 0.4, palette: ['#b2182b', '#f7f7f7', '#1a9850']}, 'NDVI_delta_2025_minus_2017', false);
Map.addLayer(lstDeltaK, {min: -4, max: 4, palette: ['#2c7bb6', '#ffffbf', '#d7191c']}, 'LST_delta_K_2025_minus_2017', false);
Map.addLayer(growthCostIndex, {min: 0, max: 1, palette: ['#ffffcc', '#fd8d3c', '#800026']}, 'growth_cost_index', false);

// ---------- 9.8 Export tasks ----------
if (B_CONFIG.DoExport) {
  Export.image.toDrive({
    image: cAndDStack,
    description: B_CONFIG.ExportPrefix + 'stack_c_and_d_ready',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'stack_c_and_d_ready',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: growthCostIndex,
    description: B_CONFIG.ExportPrefix + 'growth_cost_index',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'growth_cost_index',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: transitionCode,
    description: B_CONFIG.ExportPrefix + 'dw_transition_code',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'dw_transition_code',
    region: boundary,
    scale: 10,
    maxPixels: 1e13
  });

  Export.table.toDrive({
    collection: boroughSummary,
    description: B_CONFIG.ExportPrefix + 'borough_summary',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'borough_summary',
    fileFormat: 'CSV'
  });

  Export.table.toDrive({
    collection: rfTrainSamples,
    description: B_CONFIG.ExportPrefix + 'rf_train_samples',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'rf_train_samples',
    fileFormat: 'CSV'
  });

  Export.table.toDrive({
    collection: rfTestSamples,
    description: B_CONFIG.ExportPrefix + 'rf_test_samples',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'rf_test_samples',
    fileFormat: 'CSV'
  });
  
    Export.table.toDrive({
    collection: londonTransitionTable,
    description: B_CONFIG.ExportPrefix + 'london_transition_table',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'london_transition_table',
    fileFormat: 'CSV'
  });

  Export.table.toDrive({
    collection: boroughTransition,
    description: B_CONFIG.ExportPrefix + 'borough_transition',
    folder: 'GEE_Exports',
    fileNamePrefix: B_CONFIG.ExportPrefix + 'borough_transition',
    fileFormat: 'CSV'
  });
}

//-----part C------//


//-----part C------//

// =========================================================
// C0. Clean previous class for member C
// =========================================================
var previousClassClean = dw2017
  .updateMask(newBuiltMask)
  .updateMask(
    dw2017.neq(B_CONFIG.dwClass.water)
      .or(stableWaterBinary.eq(1))
  )
  .rename('previous_dw_class_clean');

// =========================================================
// C1. London-level land transition summary
// =========================================================
var pixelArea = ee.Image.pixelArea().rename('area');

var prevWithArea = pixelArea.addBands(
  previousClassClean.rename('previous_class')
);

var transitionDict = prevWithArea.reduceRegion({
  reducer: ee.Reducer.sum().group({
    groupField: 1,
    groupName: 'previous_class'
  }),
  geometry: boundary,
  scale: CONFIG.scale.landcover,
  maxPixels: 1e13
});

var transitionList = ee.List(transitionDict.get('groups'));

var londonTransitionTable = ee.FeatureCollection(
  transitionList.map(function(item) {
    item = ee.Dictionary(item);
    var cls = ee.Number(item.get('previous_class'));
    var area = ee.Number(item.get('sum'));

    return ee.Feature(null, {
      class_id: cls,
      area_km2: area.divide(1e6)
    });
  })
);

print('London transition summary:', londonTransitionTable);

// =========================================================
// C2. Borough-level transition summary
//    用 reduceRegions 分开算，避免 too many concurrent aggregations
// =========================================================

// A general function: calculate the area of ​​a given class in each borough.
function getClassAreaByBorough(classId, outFieldName) {
  var classAreaImage = ee.Image.pixelArea()
    .rename('area')
    .updateMask(previousClassClean.eq(classId));

  var result = classAreaImage.reduceRegions({
    collection: boroughs,
    reducer: ee.Reducer.sum(),
    scale: CONFIG.scale.landcover
  });

  return result.map(function(f) {
    return f.set(outFieldName, ee.Number(f.get('sum')).divide(1e6))
            .select([CONFIG.fields.BoroughName, CONFIG.fields.BoroughCode, outFieldName]);
  });
}

// 5 catagories
var treesByBorough = getClassAreaByBorough(1, 'trees_to_built_km2');
var grassByBorough = getClassAreaByBorough(2, 'grass_to_built_km2');
var cropsByBorough = getClassAreaByBorough(4, 'crops_to_built_km2');
var shrubByBorough = getClassAreaByBorough(5, 'shrub_to_built_km2');
var waterByBorough = getClassAreaByBorough(0, 'water_to_built_km2');

// borough code as join
function joinField(baseFc, addFc, fieldName) {
  var joined = ee.Join.saveFirst('match').apply({
    primary: baseFc,
    secondary: addFc,
    condition: ee.Filter.equals({
      leftField: CONFIG.fields.BoroughCode,
      rightField: CONFIG.fields.BoroughCode
    })
  });

  return ee.FeatureCollection(joined).map(function(f) {
    var match = ee.Feature(f.get('match'));
    return f.set(fieldName, match.get(fieldName));
  });
}

// boroughs as base table
var boroughTransition = boroughs.select([
  CONFIG.fields.BoroughName,
  CONFIG.fields.BoroughCode
]);

boroughTransition = joinField(boroughTransition, treesByBorough, 'trees_to_built_km2');
boroughTransition = joinField(boroughTransition, grassByBorough, 'grass_to_built_km2');
boroughTransition = joinField(boroughTransition, cropsByBorough, 'crops_to_built_km2');
boroughTransition = joinField(boroughTransition, shrubByBorough, 'shrub_to_built_km2');
boroughTransition = joinField(boroughTransition, waterByBorough, 'water_to_built_km2');

print('Borough transition:', boroughTransition.limit(5));

// =========================================================
// C3. Map layer: replaced land type
// =========================================================
Map.addLayer(
  previousClassClean,
  {
    min: 0,
    max: 8,
    palette: [
      '#3182bd', // 0 water
      '#006d2c', // 1 trees
      '#74c476', // 2 grass
      '#41ab5d', // 3 flooded vegetation
      '#fdae6b', // 4 crops
      '#a1d99b', // 5 shrub
      '#c4281b', // 6 built
      '#bdbdbd', // 7 bare
      '#f7f7f7'  // 8 snow/ice
    ]
  },
  'replaced_land_type',
  true
);

// =========================================================
// RF MINI VERSION
// =========================================================

// 1. select input feature
var rfBands = [
  'B2', 'B3', 'B4', 'B8',
  'NDVI_2017', 'NDVI_2025', 'NDVI_delta_2025_minus_2017',
  'LST_C', 'LST_C_1', 'LST_delta_K_2025_minus_2017',
  'water_occurrence',
  'stable_water_buffer_100m_binary',
  'dw_label_2017'
];

// 2. check band names
print('RF feature stack band names:', rfFeatureStack.bandNames());

// 3. train mini Random Forest
var rfClassifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 50,
  seed: 42
}).train({
  features: rfTrainSamples,
  classProperty: 'label_rf',
  inputProperties: rfBands
});

// 4. Use the test sample for verification.
var rfTestClassified = rfTestSamples.classify(rfClassifier);

var rfConfusionMatrix = rfTestClassified.errorMatrix('label_rf', 'classification');

print('RF confusion matrix:', rfConfusionMatrix);
print('RF overall accuracy:', rfConfusionMatrix.accuracy());
print('RF kappa:', rfConfusionMatrix.kappa());

// 5. whole area prediction
var rfPrediction = rfFeatureStack
  .select(rfBands)
  .classify(rfClassifier)
  .rename('rf_prediction');

// 6. visualization
Map.addLayer(
  rfPrediction,
  {
    min: 0,
    max: 1,
    palette: ['#f0f0f0', '#e31a1c']
  },
  'rf_prediction',
  false
);

// 7. high risk area
var rfHighRisk = rfPrediction.eq(1).selfMask().rename('rf_high_risk');

Map.addLayer(
  rfHighRisk,
  {palette: ['#e31a1c']},
  'rf_high_risk',
  false
);

// 8.  feature importance
print('RF explain:', rfClassifier.explain());

// =========================================================
// PART D. ENVIRONMENTAL COST DIAGNOSTICS
//  Green Loss / Heat Penalty / Water-edge / Growth Cost
// =========================================================

// ------------------------------
// D0. CONFIG
// ------------------------------
var D_CONFIG = {
  ExportPrefix: 'vme50_london_growth_',
  
  // Spatial heat penalty: compare new-built pixels to nearby non-built background
  HeatBufferMeters: 300,
  
  // Growth cost weights
  WeightNDVILoss: 0.35,
  WeightHeatPenalty: 0.35,
  WeightWaterEdge: 0.20,
  WeightGreenLoss: 0.10,
  
  // Normalization thresholds
  NDVILossMax: 0.6,
  HeatPenaltyMaxK: 4.0
};

// ------------------------------
// D1. HELPERS
// ------------------------------
function dCoalesceNumber(value) {
  return ee.Number(
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(value, null),
      0,
      value
    )
  );
}

function dSafeDivide(num, den) {
  num = ee.Number(num);
  den = ee.Number(den);
  return ee.Number(
    ee.Algorithms.If(den.gt(0), num.divide(den), 0)
  );
}

// ------------------------------
// D2. CORE D INDICATORS
// ------------------------------

// 2.1 Green loss
// Binary: whether new built-up replaced green/open land
var dGreenLossBinary = greenLossMask.rename('d_green_loss_binary');

// 2.2 NDVI loss intensity
// Continuous: how much vegetation dropped on new built-up land
var dNdviLoss = ndviLossForNewBuilt.rename('d_ndvi_loss_on_new_built');

// 2.3 Water-edge encroachment
// Binary: whether new built-up falls in the water-edge sensitivity zone
var dWaterEdgeEncroachment = waterEdgePressureMask.rename('d_water_edge_encroachment_binary');

// 2.4 Stronger heat penalty
// Compare 2025 LST on new-built pixels to nearby non-built, non-stable-water background
var dHeatBackgroundMask = built2025.not()
  .and(stableWaterBinary.not());

var dBackgroundLST2025 = lst2025K
  .updateMask(dHeatBackgroundMask)
  .focal_mean({
    radius: D_CONFIG.HeatBufferMeters,
    units: 'meters'
  })
  .rename('d_background_lst_2025_k');

var dHeatPenalty = lst2025K
  .subtract(dBackgroundLST2025)
  .max(0)
  .updateMask(newBuiltMask)
  .rename('d_heat_penalty_k');

// Optional temporal heat change (useful for report/QA)
var dHeatChangeTemporal = lstDeltaK
  .max(0)
  .updateMask(newBuiltMask)
  .rename('d_heat_change_temporal_k');

// ------------------------------
// D3. NORMALIZED COMPONENTS + FINAL GROWTH COST INDEX
// ------------------------------
var dNdviLossNorm = normalize01(
  dNdviLoss.unmask(0),
  0,
  D_CONFIG.NDVILossMax
).rename('d_ndvi_loss_norm');

var dHeatPenaltyNorm = normalize01(
  dHeatPenalty.unmask(0),
  0,
  D_CONFIG.HeatPenaltyMaxK
).rename('d_heat_penalty_norm');

var dWaterEdgeNorm = dWaterEdgeEncroachment
  .unmask(0)
  .rename('d_water_edge_norm');

var dGreenLossNorm = dGreenLossBinary
  .unmask(0)
  .rename('d_green_loss_norm');

var dGrowthCostIndex = dNdviLossNorm.multiply(D_CONFIG.WeightNDVILoss)
  .add(dHeatPenaltyNorm.multiply(D_CONFIG.WeightHeatPenalty))
  .add(dWaterEdgeNorm.multiply(D_CONFIG.WeightWaterEdge))
  .add(dGreenLossNorm.multiply(D_CONFIG.WeightGreenLoss))
  .updateMask(newBuiltMask)
  .rename('d_growth_cost_index');

// ------------------------------
 

// ------------------------------
// D5. BOROUGH-LEVEL SUMMARY
// ------------------------------
function buildDStatsByBorough(feature) {
  var region = feature.geometry();
  var areaImage = ee.Image.pixelArea().rename('pixel_area');

  // Areas
  var newBuiltAreaM2 = dCoalesceNumber(
    areaImage.updateMask(newBuiltMask).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: CONFIG.scale.summary,
      maxPixels: 1e13
    }).get('pixel_area')
  );

  var greenLossAreaM2 = dCoalesceNumber(
    areaImage.updateMask(dGreenLossBinary).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: CONFIG.scale.summary,
      maxPixels: 1e13
    }).get('pixel_area')
  );

  var waterEdgeAreaM2 = dCoalesceNumber(
    areaImage.updateMask(dWaterEdgeEncroachment).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: region,
      scale: CONFIG.scale.summary,
      maxPixels: 1e13
    }).get('pixel_area')
  );

  // Means
  var meanNdviLoss = dCoalesceNumber(
    dNdviLoss.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: CONFIG.scale.ndvi,
      maxPixels: 1e13
    }).get('d_ndvi_loss_on_new_built')
  );

  var meanHeatPenalty = dCoalesceNumber(
    dHeatPenalty.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: CONFIG.scale.lst,
      maxPixels: 1e13
    }).get('d_heat_penalty_k')
  );

  var meanHeatChangeTemporal = dCoalesceNumber(
    dHeatChangeTemporal.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: CONFIG.scale.lst,
      maxPixels: 1e13
    }).get('d_heat_change_temporal_k')
  );

  var meanGrowthCost = dCoalesceNumber(
    dGrowthCostIndex.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: region,
      scale: CONFIG.scale.summary,
      maxPixels: 1e13
    }).get('d_growth_cost_index')
  );

  // Shares
  var greenLossShare = dSafeDivide(greenLossAreaM2, newBuiltAreaM2);
  var waterEdgeShare = dSafeDivide(waterEdgeAreaM2, newBuiltAreaM2);

  return feature.set({
    d_new_built_area_km2: newBuiltAreaM2.divide(1e6),
    d_green_loss_area_km2: greenLossAreaM2.divide(1e6),
    d_water_edge_area_km2: waterEdgeAreaM2.divide(1e6),
    d_green_loss_share_of_new_built: greenLossShare,
    d_water_edge_share_of_new_built: waterEdgeShare,
    d_mean_ndvi_loss: meanNdviLoss,
    d_mean_heat_penalty_k: meanHeatPenalty,
    d_mean_heat_change_temporal_k: meanHeatChangeTemporal,
    d_mean_growth_cost_index: meanGrowthCost
  });
}

var dBoroughSummary = boroughs.map(buildDStatsByBorough);

// ------------------------------
// D6. BOROUGH RANKING
// ------------------------------
var dBoroughSummarySorted = dBoroughSummary.sort('d_mean_growth_cost_index', false);
var dCount = dBoroughSummarySorted.size();
var dList = dBoroughSummarySorted.toList(dCount);

var dBoroughRanking = ee.FeatureCollection(
  ee.List.sequence(0, dCount.subtract(1)).map(function(i) {
    i = ee.Number(i);
    var f = ee.Feature(dList.get(i));
    return f.set('d_rank_growth_cost', i.add(1));
  })
);

print('D borough ranking (top 10):', dBoroughRanking.limit(10));
print('D borough ranking (bottom 10):', dBoroughRanking.sort('d_mean_growth_cost_index', true).limit(10));

// ------------------------------
// D7. OPTIONAL HOTSPOT TABLE
// Simple threshold-based hotspot extraction for reporting
// ------------------------------
var dHotspots = dGrowthCostIndex.gt(0.6).selfMask().rename('d_hotspots_high_cost');

var dHotspotAreaByBorough = boroughs.map(function(feature) {
  var hotspotAreaM2 = dCoalesceNumber(
    ee.Image.pixelArea().updateMask(dHotspots).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: feature.geometry(),
      scale: CONFIG.scale.summary,
      maxPixels: 1e13
    }).get('area')
  );

  return feature.set({
    d_hotspot_area_km2: hotspotAreaM2.divide(1e6)
  });
});

// Join hotspot area back into ranking table
function dJoinField(baseFc, addFc, fieldName) {
  var joined = ee.Join.saveFirst('match').apply({
    primary: baseFc,
    secondary: addFc,
    condition: ee.Filter.equals({
      leftField: CONFIG.fields.BoroughCode,
      rightField: CONFIG.fields.BoroughCode
    })
  });

  return ee.FeatureCollection(joined).map(function(f) {
    var match = ee.Feature(f.get('match'));
    return f.set(fieldName, match.get(fieldName));
  });
}

var dFinalRanking = dJoinField(
  dBoroughRanking,
  dHotspotAreaByBorough.select([CONFIG.fields.BoroughCode, 'd_hotspot_area_km2']),
  'd_hotspot_area_km2'
);

print('D final ranking with hotspot area:', dFinalRanking.limit(10));

// ------------------------------
// D8. VISUALIZATION
// ------------------------------
Map.addLayer(
  dGreenLossBinary.selfMask(),
  {palette: ['#31a354']},
  'D_green_loss_binary',
  false
);

Map.addLayer(
  dNdviLoss,
  {
    min: 0,
    max: 0.6,
    palette: ['#f7fcf5', '#74c476', '#00441b']
  },
  'D_ndvi_loss_on_new_built',
  false
);

Map.addLayer(
  dHeatPenalty,
  {
    min: 0,
    max: 4,
    palette: ['#fff5f0', '#fc9272', '#cb181d']
  },
  'D_heat_penalty_k_vs_buffer',
  true
);

Map.addLayer(
  dHeatChangeTemporal,
  {
    min: 0,
    max: 4,
    palette: ['#fff5f0', '#fb6a4a', '#a50f15']
  },
  'D_heat_change_temporal_k',
  false
);

Map.addLayer(
  dWaterEdgeEncroachment.selfMask(),
  {palette: ['#08519c']},
  'D_water_edge_encroachment',
  false
);

Map.addLayer(
  dGrowthCostIndex,
  {
    min: 0,
    max: 1,
    palette: ['#ffffcc', '#fd8d3c', '#800026']
  },
  'D_growth_cost_index',
  true
);

Map.addLayer(
  dHotspots,
  {palette: ['#800026']},
  'D_high_cost_hotspots',
  false
);

// ------------------------------
// D9. EXPORTS
// Turn B_CONFIG.DoExport = true when ready
// ------------------------------
var dFinalRankingClean = dFinalRanking.select([
  CONFIG.fields.BoroughCode,
  CONFIG.fields.BoroughName,
  'd_rank_growth_cost',
  'd_new_built_area_km2',
  'd_green_loss_area_km2',
  'd_green_loss_share_of_new_built',
  'd_water_edge_area_km2',
  'd_water_edge_share_of_new_built',
  'd_mean_ndvi_loss',
  'd_mean_heat_penalty_k',
  'd_mean_heat_change_temporal_k',
  'd_mean_growth_cost_index',
  'd_hotspot_area_km2'
]);
B_CONFIG.DoExport = true;
if (B_CONFIG.DoExport) {

  Export.image.toDrive({
    image: dGreenLossBinary.unmask(0),
    description: D_CONFIG.ExportPrefix + 'D_green_loss_binary',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_green_loss_binary',
    region: boundary,
    scale: 10,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: dNdviLoss.unmask(0),
    description: D_CONFIG.ExportPrefix + 'D_ndvi_loss_on_new_built',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_ndvi_loss_on_new_built',
    region: boundary,
    scale: 10,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: dHeatPenalty.unmask(0),
    description: D_CONFIG.ExportPrefix + 'D_heat_penalty_k_vs_buffer',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_heat_penalty_k_vs_buffer',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: dWaterEdgeEncroachment.unmask(0),
    description: D_CONFIG.ExportPrefix + 'D_water_edge_encroachment',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_water_edge_encroachment',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: dGrowthCostIndex.unmask(0),
    description: D_CONFIG.ExportPrefix + 'D_growth_cost_index',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_growth_cost_index',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.image.toDrive({
    image: dRasterStack,
    description: D_CONFIG.ExportPrefix + 'D_raster_stack',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_raster_stack',
    region: boundary,
    scale: 30,
    maxPixels: 1e13
  });

  Export.table.toDrive({
    collection: dBoroughSummary,
    description: D_CONFIG.ExportPrefix + 'D_borough_summary',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_borough_summary',
    fileFormat: 'CSV'
  });
  Export.table.toDrive({
    collection: dFinalRankingClean,
    description: D_CONFIG.ExportPrefix + 'D_borough_ranking_clean',
    folder: 'GEE_Exports',
    fileNamePrefix: D_CONFIG.ExportPrefix + 'D_borough_ranking_clean',
    fileFormat: 'CSV'
  });
}