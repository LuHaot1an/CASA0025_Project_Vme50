/**
 * F_charts.js
 * Chart module for London Growth Cost Explorer
 *
 * Author: F
 * Purpose:
 *   Build reusable Earth Engine ui.Chart objects for borough-level comparison,
 *   designed to plug into the UI app panel.
 *
 * Expected inputs:
 *   1) rankingFc: ee.FeatureCollection with fields:
 *      - NAME
 *      - d_mean_growth_cost_index
 *        OR
 *      - mean_growth_cost_index
 *
 *   2) transitionFc: ee.FeatureCollection with fields:
 *      - NAME
 *      - grass_to_built_km2
 *      - trees_to_built_km2
 *      - shrub_to_built_km2
 *      - crops_to_built_km2
 *      - water_to_built_km2
 *
 * Notes:
 *   - Built for use inside a larger ui.Panel-based Earth Engine app.
 *   - Includes guard clauses to avoid chart crashes when boroughs or fields
 *     are missing.
 */

// ============================================================================
// Style constants
// ============================================================================

var COLORS = {
  blueDark: '#123d7a',
  blueMid: '#2b6cb0',
  text: '#2f3b52',
  grid: '#d9dee7',
  bg: '#ffffff',
  grass: '#7fc97f',
  trees: '#1b9e77',
  shrub: '#66c2a5',
  crops: '#ffd92f',
  water: '#80b1d3',
  muted: '#f3f4f6',
  error: '#b91c1c'
};

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Merge two plain JavaScript option objects.
 */
function mergeOptions(base, extra) {
  var out = {};
  Object.keys(base || {}).forEach(function(key) {
    out[key] = base[key];
  });
  Object.keys(extra || {}).forEach(function(key) {
    out[key] = extra[key];
  });
  return out;
}

/**
 * Shared chart style.
 */
function baseChartOptions() {
  return {
    backgroundColor: COLORS.bg,
    fontName: 'Arial',
    titleTextStyle: {
      color: COLORS.text,
      fontSize: 16,
      bold: true
    },
    hAxis: {
      textStyle: {color: COLORS.text, fontSize: 12},
      titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
      gridlines: {color: COLORS.grid}
    },
    vAxis: {
      textStyle: {color: COLORS.text, fontSize: 12},
      titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
      gridlines: {color: COLORS.grid}
    },
    legend: {
      textStyle: {color: COLORS.text, fontSize: 12}
    },
    chartArea: {
      left: 110,
      right: 20,
      top: 45,
      bottom: 60,
      width: '72%',
      height: '70%'
    }
  };
}

/**
 * Return a safe numeric value from a feature property.
 */
function num(ft, field) {
  return ee.Number(ee.Algorithms.If(
    ee.Algorithms.IsEqual(ft.get(field), null),
    0,
    ft.get(field)
  ));
}

/**
 * Create a small fallback panel when chart data is missing.
 * Useful inside E's UI side panel.
 */
exports.makeMessagePanel = function(title, message) {
  return ui.Panel([
    ui.Label(title || 'Chart unavailable', {
      fontWeight: 'bold',
      fontSize: '13px',
      color: COLORS.text,
      margin: '0 0 6px 0'
    }),
    ui.Label(message || 'No data available.', {
      fontSize: '11px',
      color: '#666666',
      whiteSpace: 'pre-wrap'
    })
  ], ui.Panel.Layout.flow('vertical'), {
    padding: '10px',
    margin: '6px 0',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e7eb'
  });
};

/**
 * Detect which growth cost field exists.
 * Supports both your earlier draft and E/B style naming.
 */
function getRankingFieldName() {
  return ee.String('d_mean_growth_cost_index');
}

/**
 * Add a harmonised ranking field `growth_cost_for_chart`.
 * Tries d_mean_growth_cost_index first, then mean_growth_cost_index.
 */
function normaliseRankingField(fc) {
  return ee.FeatureCollection(fc).map(function(ft) {
    var value = ee.Algorithms.If(
      ee.Algorithms.IsEqual(ft.get('d_mean_growth_cost_index'), null),
      ft.get('mean_growth_cost_index'),
      ft.get('d_mean_growth_cost_index')
    );
    return ft.set('growth_cost_for_chart', ee.Number(value));
  });
}

/**
 * Add a total transition field for ranking boroughs by total replaced land.
 */
function addTotalTransition(fc) {
  return ee.FeatureCollection(fc).map(function(ft) {
    var total = num(ft, 'grass_to_built_km2')
      .add(num(ft, 'trees_to_built_km2'))
      .add(num(ft, 'shrub_to_built_km2'))
      .add(num(ft, 'crops_to_built_km2'))
      .add(num(ft, 'water_to_built_km2'));

    return ft.set('total_transition_km2', total);
  });
}

/**
 * Convert a borough feature into a FeatureCollection of land-type records.
 * Filters out zero-value categories to keep the pie chart clean.
 */
function boroughToLandTypeFc(feature) {
  var fc = ee.FeatureCollection([
    ee.Feature(null, {
      land_type: 'Grass',
      area_km2: num(feature, 'grass_to_built_km2')
    }),
    ee.Feature(null, {
      land_type: 'Trees',
      area_km2: num(feature, 'trees_to_built_km2')
    }),
    ee.Feature(null, {
      land_type: 'Shrub',
      area_km2: num(feature, 'shrub_to_built_km2')
    }),
    ee.Feature(null, {
      land_type: 'Crops',
      area_km2: num(feature, 'crops_to_built_km2')
    }),
    ee.Feature(null, {
      land_type: 'Water',
      area_km2: num(feature, 'water_to_built_km2')
    })
  ]);

  return fc.filter(ee.Filter.gt('area_km2', 0));
}

/**
 * Default reusable panel wrapper so charts look neat in E's control panel.
 */
exports.wrapChart = function(chart, titleText) {
  var panel = ui.Panel([], ui.Panel.Layout.flow('vertical'), {
    padding: '8px 10px',
    margin: '6px 0',
    backgroundColor: '#fafafa',
    border: '1px solid #e5e7eb'
  });

  if (titleText) {
    panel.add(ui.Label(titleText, {
      fontWeight: 'bold',
      fontSize: '13px',
      color: COLORS.text,
      margin: '0 0 6px 0'
    }));
  }

  panel.add(chart);
  return panel;
};

// ============================================================================
// Export 1 — Top borough ranking chart
// ============================================================================

/**
 * Create a horizontal bar chart of the top boroughs by growth cost index.
 *
 * @param {ee.FeatureCollection} rankingFc
 * @param {Object=} options
 *   - topN {number} default 10
 *   - title {string}
 * @return {ui.Chart}
 */
exports.makeBoroughRankingChart = function(rankingFc, options) {
  options = options || {};
  var topN = options.topN || 10;
  var title = options.title || ('Top ' + topN + ' Boroughs by Environmental Growth Cost Index');

  var prepared = normaliseRankingField(rankingFc)
    .filter(ee.Filter.notNull(['NAME', 'growth_cost_for_chart']))
    .sort('growth_cost_for_chart', false)
    .limit(topN);

  var chart = ui.Chart.feature.byFeature({
    features: prepared,
    xProperty: 'NAME',
    yProperties: ['growth_cost_for_chart']
  })
    .setChartType('BarChart')
    .setOptions(mergeOptions(baseChartOptions(), {
      title: title,
      legend: {position: 'none'},
      colors: [COLORS.blueDark],
      bars: 'horizontal',
      hAxis: {
        title: 'Mean Growth Cost Index',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        gridlines: {color: COLORS.grid}
      },
      vAxis: {
        title: '',
        textStyle: {color: COLORS.text, fontSize: 12}
      }
    }));

  return chart;
};

// ============================================================================
// Export 2 — Stacked land replacement chart
// ============================================================================

/**
 * Create a stacked chart showing which land types were replaced by new built-up
 * land in boroughs with the largest total transition into built surfaces.
 *
 * @param {ee.FeatureCollection} transitionFc
 * @param {Object=} options
 *   - topN {number} default 8
 *   - title {string}
 * @return {ui.Chart}
 */
exports.makeReplacedLandChart = function(transitionFc, options) {
  options = options || {};
  var topN = options.topN || 8;
  var title = options.title || ('Land Types Replaced by New Built-up Areas (Top ' + topN + ')');

  var ranked = addTotalTransition(transitionFc)
    .filter(ee.Filter.notNull([
      'NAME',
      'grass_to_built_km2',
      'trees_to_built_km2',
      'shrub_to_built_km2',
      'crops_to_built_km2',
      'water_to_built_km2'
    ]))
    .sort('total_transition_km2', false)
    .limit(topN);

  var chart = ui.Chart.feature.byFeature({
    features: ranked,
    xProperty: 'NAME',
    yProperties: [
      'grass_to_built_km2',
      'trees_to_built_km2',
      'shrub_to_built_km2',
      'crops_to_built_km2',
      'water_to_built_km2'
    ]
  })
    .setChartType('ColumnChart')
    .setSeriesNames(['Grass', 'Trees', 'Shrub', 'Crops', 'Water'])
    .setOptions(mergeOptions(baseChartOptions(), {
      title: title,
      isStacked: true,
      colors: [
        COLORS.grass,
        COLORS.trees,
        COLORS.shrub,
        COLORS.crops,
        COLORS.water
      ],
      hAxis: {
        title: 'Borough',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        slantedText: true,
        slantedTextAngle: 35,
        gridlines: {color: COLORS.grid}
      },
      vAxis: {
        title: 'Area replaced by new built-up land (km²)',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        gridlines: {color: COLORS.grid}
      },
      legend: {
        position: 'right',
        textStyle: {color: COLORS.text, fontSize: 12}
      }
    }));

  return chart;
};

// ============================================================================
// Export 3 — Single-borough pie chart
// ============================================================================

/**
 * Create a borough-specific pie chart showing replaced land composition.
 *
 * @param {ee.FeatureCollection} transitionFc
 * @param {string} boroughName
 * @param {Object=} options
 *   - title {string}
 * @return {ui.Chart|ui.Panel}
 */
exports.makeSingleBoroughPieChart = function(transitionFc, boroughName, options) {
  options = options || {};

  if (!boroughName) {
    return exports.makeMessagePanel(
      'Borough composition',
      'Please select a borough first.'
    );
  }

  var boroughFc = ee.FeatureCollection(transitionFc)
    .filter(ee.Filter.eq('NAME', boroughName));

  var borough = ee.Feature(boroughFc.first());

  var landTypeFc = boroughToLandTypeFc(borough);

  var chart = ui.Chart.feature.byFeature({
    features: landTypeFc,
    xProperty: 'land_type',
    yProperties: ['area_km2']
  })
    .setChartType('PieChart')
    .setOptions({
      title: options.title || ('Land Types Replaced in ' + boroughName),
      backgroundColor: COLORS.bg,
      fontName: 'Arial',
      titleTextStyle: {
        color: COLORS.text,
        fontSize: 16,
        bold: true
      },
      legend: {
        position: 'right',
        textStyle: {color: COLORS.text, fontSize: 12}
      },
      pieSliceText: 'value',
      pieHole: 0.35,
      chartArea: {
        left: 20,
        right: 20,
        top: 45,
        bottom: 20,
        width: '90%',
        height: '78%'
      },
      slices: {
        0: {color: COLORS.grass},
        1: {color: COLORS.trees},
        2: {color: COLORS.shrub},
        3: {color: COLORS.crops},
        4: {color: COLORS.water}
      }
    });

  return chart;
};

// ============================================================================
// Export 4 — Convenience panel builder for the UI app
// ============================================================================

/**
 * Build a ready-to-drop chart section for E's left control panel or side panel.
 *
 * @param {Object} params
 *   - rankingFc
 *   - transitionFc
 *   - selectedBoroughName
 * @return {ui.Panel}
 */
exports.buildChartsPanel = function(params) {
  params = params || {};

  var panel = ui.Panel([], ui.Panel.Layout.flow('vertical'), {
    padding: '6px 0'
  });

  panel.add(ui.Label('Borough Charts', {
    fontSize: '13px',
    fontWeight: 'bold',
    color: COLORS.text,
    margin: '4px 0 6px 0'
  }));

  if (params.rankingFc) {
    panel.add(exports.wrapChart(
      exports.makeBoroughRankingChart(params.rankingFc, {topN: 10}),
      null
    ));
  }

  if (params.transitionFc) {
    panel.add(exports.wrapChart(
      exports.makeReplacedLandChart(params.transitionFc, {topN: 8}),
      null
    ));
  }

  if (params.transitionFc && params.selectedBoroughName) {
    panel.add(exports.wrapChart(
      exports.makeSingleBoroughPieChart(
        params.transitionFc,
        params.selectedBoroughName
      ),
      null
    ));
  } else {
    panel.add(exports.makeMessagePanel(
      'Borough composition',
      'Select a borough in the UI to show its replaced-land composition.'
    ));
  }

  return panel;
};