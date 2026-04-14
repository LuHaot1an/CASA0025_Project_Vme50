# London Growth Cost Explorer  
## Data Dictionary

This document describes all clean, analysis-ready outputs generated in `B_preprocess_data.js` for downstream visualization, interaction, and modeling.

---

## Quick Start: How to Use the Exported Assets

All exported files are stored under this asset root path:

- `projects/london-growth-cost-explorer/assets/`

In Earth Engine, each file is loaded by combining the root path with the asset name.

### 0) Base path

```javascript
var ASSET_ROOT = 'projects/london-growth-cost-explorer/assets/';
```

### 1) Load raster assets (`ee.Image`)

```javascript
var stack = ee.Image(ASSET_ROOT + 'vme50_london_growth_stack_c_and_d_ready');
var growthCost = ee.Image(ASSET_ROOT + 'vme50_london_growth_growth_cost_index');
var transition = ee.Image(ASSET_ROOT + 'vme50_london_growth_dw_transition_code');
```

### 2) Load table assets (`ee.FeatureCollection`)

```javascript
var boroughSummary = ee.FeatureCollection(ASSET_ROOT + 'vme50_london_growth_borough_summary');
var rfTrain = ee.FeatureCollection(ASSET_ROOT + 'vme50_london_growth_rf_train_samples');
var rfTest = ee.FeatureCollection(ASSET_ROOT + 'vme50_london_growth_rf_test_samples');
```

### 3) Minimal map check

```javascript
Map.centerObject(boroughSummary, 9);
Map.addLayer(growthCost, {min: 0, max: 1, palette: ['#ffffcc', '#fd8d3c', '#800026']}, 'growth_cost_index');
Map.addLayer(transition, {min: 0, max: 88, palette: ['#f7fbff', '#6baed6', '#08306b']}, 'dw_transition_code', false);
```

> Note: `Table ID` / `Image ID` shown in the Asset panel is the full asset path used directly in code.

---

## 1) Output Packages

The preprocessing workflow exports six files in total, grouped into four product types:

1. **Raster stack for application layers and spatial analysis**  
   Export name: `vme50_london_growth_stack_c_and_d_ready`
2. **Derived single-band rasters for direct mapping and lightweight app loading**  
   Export names:  
   - `vme50_london_growth_growth_cost_index`  
   - `vme50_london_growth_dw_transition_code`
3. **Borough-level summary table (CSV)**  
   Export name: `vme50_london_growth_borough_summary`
4. **Random-forest-ready sample tables (CSV)**  
   Export names:  
   - `vme50_london_growth_rf_train_samples`  
   - `vme50_london_growth_rf_test_samples`

> Export tasks are executed only when `B_CONFIG.DoExport = true`.

### 1.1 Export File Inventory (All 6)

| Export file | Data type | Format | Main purpose |
|---|---|---|---|
| `vme50_london_growth_stack_c_and_d_ready` | Multi-band raster | GeoTIFF (image export) | Core analysis stack for map layers and downstream statistics |
| `vme50_london_growth_growth_cost_index` | Single-band raster | GeoTIFF (image export) | Direct visualization of integrated environmental cost hotspot intensity |
| `vme50_london_growth_dw_transition_code` | Single-band raster | GeoTIFF (image export) | Land-cover transition diagnostics (what changed to built-up) |
| `vme50_london_growth_borough_summary` | Vector table | CSV | Borough-level ranking, charting, and dashboard joins |
| `vme50_london_growth_rf_train_samples` | Sample table | CSV | Training dataset for Random Forest route |
| `vme50_london_growth_rf_test_samples` | Sample table | CSV | Independent testing dataset for Random Forest evaluation |

---

## 2) Raster Stack Dictionary (`cAndDStack`)

The `cAndDStack` image is the main handoff product for mapping and analysis.  
It includes the following bands:

| Band name | Meaning | Unit | Typical value range | Primary use |
|---|---|---:|---:|---|
| `new_built_2017_2025` | Pixels that changed from non-built (2017) to built (2025) | binary | 0/1 | Core expansion mask; hotspot mapping |
| `persisted_built` | Pixels built in both 2017 and 2025 | binary | 0/1 | Baseline built-up context |
| `previous_dw_class` | Dynamic World class in 2017 for new-built pixels | class ID | 0-8 (masked outside new built) | Identify what land type was replaced |
| `dw_transition_code` | Transition code computed as `2017_class * 10 + 2025_class` | integer code | e.g. 16 = trees->built | Transition diagnostics and legends |
| `green_loss_to_built` | New-built pixels that replaced green/open classes (trees, grass, crops, shrub) | binary | 0/1 | Green loss assessment |
| `new_built_in_water_edge_zone` | New-built pixels inside 100 m stable-water edge zone | binary | 0/1 | Water-edge pressure screening |
| `NDVI_2017` | Sentinel-2 NDVI baseline (2017 growing season composite) | NDVI index | approx. -1 to 1 | Baseline vegetation condition |
| `NDVI_2025` | Sentinel-2 NDVI endpoint (2025 growing season composite) | NDVI index | approx. -1 to 1 | Current vegetation condition |
| `NDVI_delta_2025_minus_2017` | NDVI change (`2025 - 2017`) | NDVI delta | approx. -1 to 1 | Vegetation trend analysis |
| `LST_2017_K` | Landsat summer LST baseline (2017) | Kelvin | ~285-315 K (context-dependent) | Thermal baseline |
| `LST_2025_K` | Landsat summer LST endpoint (2025) | Kelvin | ~285-315 K (context-dependent) | Current thermal condition |
| `LST_delta_K_2025_minus_2017` | LST change (`2025 - 2017`) | Kelvin | typically negative/positive small values | Heat penalty diagnostics |
| `growth_cost_index` | Composite 0-1 expansion cost score on new-built pixels | normalized index | 0-1 (masked outside new built) | Priority/ranking layer for policy focus |

---

## 3) Dynamic World Class Reference

The workflow uses Google Dynamic World label IDs:

| Class ID | Class name |
|---:|---|
| 0 | water |
| 1 | trees |
| 2 | grass |
| 3 | flooded_vegetation |
| 4 | crops |
| 5 | shrub_and_scrub |
| 6 | built |
| 7 | bare |
| 8 | snow_and_ice |

---

## 4) Borough Summary Table Dictionary (`boroughSummary`)

Each record corresponds to one London borough feature.

| Field name | Meaning | Unit | Primary use |
|---|---|---:|---|
| `NAME` / `GSS_CODE` | Borough name and code (from source boundary asset) | text | Join key in dashboards/charts |
| `new_built_area_km2` | Area converted to built between 2017-2025 | km2 | Expansion intensity comparison |
| `green_loss_area_km2` | Area of green/open classes replaced by new built | km2 | Ecological opportunity-cost comparison |
| `water_edge_pressure_area_km2` | New built inside stable-water edge sensitivity zone | km2 | Water-edge pressure comparison |
| `mean_ndvi_loss_on_new_built` | Mean positive NDVI loss over new-built pixels | NDVI units | Vegetation penalty indicator |
| `mean_lst_penalty_k_on_new_built` | Mean positive LST increase over new-built pixels | Kelvin | Thermal penalty indicator |
| `mean_growth_cost_index` | Mean composite cost score on new-built pixels | 0-1 index | Borough ranking for intervention priority |

---

## 5) Random Forest Sample Tables Dictionary

The train/test CSV files are sampled from `rfSamplingImage` and are ready for model training.

### 5.1 Label and split fields

| Field name | Meaning | Unit / Type |
|---|---|---|
| `label_rf` | Binary class target (`1 = new built`, `0 = not new built`) | integer |
| `split_random` | Random number used for train/test split | float [0,1) |

### 5.2 Predictor fields

| Field name | Meaning | Unit |
|---|---|---:|
| `B2` | Sentinel-2 blue reflectance (2025 composite) | unitless reflectance |
| `B3` | Sentinel-2 green reflectance (2025 composite) | unitless reflectance |
| `B4` | Sentinel-2 red reflectance (2025 composite) | unitless reflectance |
| `B8` | Sentinel-2 NIR reflectance (2025 composite) | unitless reflectance |
| `NDVI_2017` | Baseline NDVI | NDVI index |
| `NDVI_2025` | Endpoint NDVI | NDVI index |
| `NDVI_delta_2025_minus_2017` | NDVI change | NDVI delta |
| `LST_C` (from 2017 image) | Baseline LST converted from Kelvin to Celsius | deg C |
| `LST_C_1` (from 2025 image) | Endpoint LST converted from Kelvin to Celsius | deg C |
| `LST_delta_K_2025_minus_2017` | LST change | Kelvin |
| `water_occurrence` | JRC long-term surface water occurrence | percent (0-100) |
| `stable_water_buffer_100m_binary` | Stable-water 100 m buffer flag | binary |
| `dw_label_2017` | Dynamic World class label in 2017 | class ID (0-8) |

> Note: Earth Engine may append suffixes such as `_1` when bands share names during concatenation (e.g., two `LST_C` bands from different years).

---

## 6) Recommended Usage

- **Visualization / storytelling:** use `new_built_2017_2025`, `green_loss_to_built`, `new_built_in_water_edge_zone`, and `growth_cost_index` as core thematic layers.  
- **Interaction / analytics:** use `boroughSummary` for ranking panels and linked charts; use `dw_transition_code` for drill-down transition statistics.  
- **Modeling track (Route A):** use `rf_train_samples` and `rf_test_samples` directly for random forest baseline experiments and accuracy reporting.

---

## 7) Export Naming Convention

All exported files use:

- Prefix: `vme50_london_growth_`
- Folder: `GEE_Exports`
- Region: Greater London boundary

This consistent naming is designed for easy ingestion into app scripts, dashboards, and report pipelines.

