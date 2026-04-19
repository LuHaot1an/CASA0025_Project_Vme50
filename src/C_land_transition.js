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
//    Use reduceRegions to calculate separately to avoid too many concurrent aggregations.
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
