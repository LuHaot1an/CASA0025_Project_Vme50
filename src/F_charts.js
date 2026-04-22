/**
 * F_charts.js
 * Final chart module for London Growth Cost Explorer
 *
 * Purpose:
 *   Reusable Earth Engine ui.Chart builders aligned with the final app design:
 *   1) London-wide top borough ranking
 *   2) Single-borough key indicators (standardised 0–1)
 *   3) Single-borough vs London average comparison
 *
 * Expected input:
 *   summaryFc: ee.FeatureCollection with fields:
 *     - NAME
 *     - d_mean_growth_cost_index
 *     - d_green_loss_area_km2
 *     - d_green_loss_share_of_new_built
 *     - d_water_edge_area_km2
 *     - d_water_edge_share_of_new_built
 *     - d_mean_ndvi_loss
 *     - d_mean_heat_penalty_k
 *     - d_new_built_area_km2
 *
 * Notes:
 *   - Built for use inside a larger ui.Panel-based Earth Engine app.
 *   - Includes small guard/fallback panels when boroughs are missing.
 */

// ============================================================================
// Style constants
// ============================================================================

var COLORS = {
  blueDark: '#123d7a',
  blueMid: '#2b6cb0',
  red: '#a50f15',
  grey: '#9ca3af',
  text: '#2f3b52',
  grid: '#d9dee7',
  bg: '#ffffff'
};

// ============================================================================
// Helpers
// ============================================================================

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
      left: 90,
      right: 20,
      top: 45,
      bottom: 60,
      width: '74%',
      height: '70%'
    }
  };
}

function num(ft, field) {
  return ee.Number(ee.Algorithms.If(
    ee.Algorithms.IsEqual(ft.get(field), null),
    0,
    ft.get(field)
  ));
}

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
// Internal preparation
// ============================================================================

function prepareSummaryFc(summaryFc) {
  summaryFc = ee.FeatureCollection(summaryFc);

  var indicatorFields = [
    'd_new_built_area_km2',
    'd_green_loss_area_km2',
    'd_water_edge_area_km2',
    'd_mean_ndvi_loss',
    'd_mean_heat_penalty_k'
  ];

  var mins = {};
  var maxs = {};

  indicatorFields.forEach(function(field) {
    mins[field] = ee.Number(summaryFc.aggregate_min(field));
    maxs[field] = ee.Number(summaryFc.aggregate_max(field));
  });

  function scale(value, minVal, maxVal) {
    value = ee.Number(value);
    minVal = ee.Number(minVal);
    maxVal = ee.Number(maxVal);
    return ee.Number(ee.Algorithms.If(
      maxVal.eq(minVal),
      0,
      value.subtract(minVal).divide(maxVal.subtract(minVal))
    ));
  }

  return summaryFc.map(function(ft) {
    var growthCost = num(ft, 'd_mean_growth_cost_index');
    var greenShare = num(ft, 'd_green_loss_share_of_new_built');
    var waterShare = num(ft, 'd_water_edge_share_of_new_built');
    var ndviLoss = num(ft, 'd_mean_ndvi_loss');
    var heatPenalty = num(ft, 'd_mean_heat_penalty_k');

    return ft
      .set('growth_cost_for_chart', growthCost)
      .set('green_loss_share_for_chart', greenShare)
      .set('water_edge_share_for_chart', waterShare)
      .set('ndvi_loss_for_chart', ndviLoss)
      .set('heat_penalty_for_chart', heatPenalty)
      .set('std_new_built', scale(num(ft, 'd_new_built_area_km2'),
                                  mins['d_new_built_area_km2'],
                                  maxs['d_new_built_area_km2']))
      .set('std_green_loss', scale(num(ft, 'd_green_loss_area_km2'),
                                   mins['d_green_loss_area_km2'],
                                   maxs['d_green_loss_area_km2']))
      .set('std_water_edge', scale(num(ft, 'd_water_edge_area_km2'),
                                   mins['d_water_edge_area_km2'],
                                   maxs['d_water_edge_area_km2']))
      .set('std_ndvi_loss', scale(ndviLoss,
                                  mins['d_mean_ndvi_loss'],
                                  maxs['d_mean_ndvi_loss']))
      .set('std_heat_penalty', scale(heatPenalty,
                                     mins['d_mean_heat_penalty_k'],
                                     maxs['d_mean_heat_penalty_k']));
  });
}

function getSingleBoroughFeature(summaryFc, boroughName) {
  return ee.FeatureCollection(summaryFc)
    .filter(ee.Filter.eq('NAME', boroughName))
    .first();
}

// ============================================================================
// Export 1 — London-wide ranking chart
// ============================================================================

exports.makeBoroughRankingChart = function(summaryFc, options) {
  options = options || {};
  var topN = options.topN || 10;
  var title = options.title ||
    ('Top ' + topN + ' boroughs by Growth Cost Index (higher = greater environmental cost)');

  var prepared = prepareSummaryFc(summaryFc)
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
        gridlines: {color: COLORS.grid},
        viewWindowMode: 'explicit',
        viewWindow: {min: 0}
      },
      vAxis: {
        title: '',
        textStyle: {color: COLORS.text, fontSize: 12}
      },
      chartArea: {
        left: 120,
        right: 20,
        top: 40,
        bottom: 40,
        width: '68%',
        height: '72%'
      }
    }));

  return chart;
};

// ============================================================================
// Export 2 — Single-borough key indicators (standardised 0–1)
// ============================================================================

exports.makeBoroughIndicatorsChart = function(summaryFc, boroughName, options) {
  options = options || {};

  if (!boroughName) {
    return exports.makeMessagePanel(
      'Key indicators',
      'Please select a borough first.'
    );
  }

  var prepared = prepareSummaryFc(summaryFc);
  var borough = ee.Feature(getSingleBoroughFeature(prepared, boroughName));

  var indicatorFc = ee.FeatureCollection([
    ee.Feature(null, {
      indicator: 'New built',
      value: num(borough, 'std_new_built')
    }),
    ee.Feature(null, {
      indicator: 'Green loss',
      value: num(borough, 'std_green_loss')
    }),
    ee.Feature(null, {
      indicator: 'Water-edge',
      value: num(borough, 'std_water_edge')
    }),
    ee.Feature(null, {
      indicator: 'NDVI loss',
      value: num(borough, 'std_ndvi_loss')
    }),
    ee.Feature(null, {
      indicator: 'Heat penalty',
      value: num(borough, 'std_heat_penalty')
    })
  ]);

  var chart = ui.Chart.feature.byFeature({
    features: indicatorFc,
    xProperty: 'indicator',
    yProperties: ['value']
  })
    .setChartType('ColumnChart')
    .setOptions(mergeOptions(baseChartOptions(), {
      title: (options.title || (boroughName + ' - key indicators (standardised 0-1)')),
      legend: {position: 'none'},
      colors: [COLORS.blueMid],
      hAxis: {
        title: 'Indicator',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        slantedText: true,
        slantedTextAngle: 20,
        gridlines: {color: COLORS.grid}
      },
      vAxis: {
        title: 'Standardised value',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        gridlines: {color: COLORS.grid},
        viewWindow: {min: 0, max: 1}
      },
      chartArea: {
        left: 60,
        right: 20,
        top: 40,
        bottom: 55,
        width: '74%',
        height: '68%'
      }
    }));

  return chart;
};

// ============================================================================
// Export 3 — Single-borough vs London average comparison
// ============================================================================

exports.makeBoroughVsLondonChart = function(summaryFc, boroughName, options) {
  options = options || {};

  if (!boroughName) {
    return exports.makeMessagePanel(
      'Borough vs London',
      'Please select a borough first.'
    );
  }

  var prepared = prepareSummaryFc(summaryFc);
  var borough = ee.Feature(getSingleBoroughFeature(prepared, boroughName));

  var londonGrowthCost = ee.Number(prepared.aggregate_mean('growth_cost_for_chart'));
  var londonGreenShare = ee.Number(prepared.aggregate_mean('green_loss_share_for_chart'));
  var londonWaterShare = ee.Number(prepared.aggregate_mean('water_edge_share_for_chart'));
  var londonNdviLoss = ee.Number(prepared.aggregate_mean('ndvi_loss_for_chart'));
  var londonHeatPenalty = ee.Number(prepared.aggregate_mean('heat_penalty_for_chart'));

  var comparisonFc = ee.FeatureCollection([
    ee.Feature(null, {
      metric: 'Growth Cost',
      Borough: num(borough, 'growth_cost_for_chart'),
      London: londonGrowthCost
    }),
    ee.Feature(null, {
      metric: 'Green-loss share',
      Borough: num(borough, 'green_loss_share_for_chart'),
      London: londonGreenShare
    }),
    ee.Feature(null, {
      metric: 'Water-edge share',
      Borough: num(borough, 'water_edge_share_for_chart'),
      London: londonWaterShare
    }),
    ee.Feature(null, {
      metric: 'NDVI loss',
      Borough: num(borough, 'ndvi_loss_for_chart'),
      London: londonNdviLoss
    }),
    ee.Feature(null, {
      metric: 'Heat penalty',
      Borough: num(borough, 'heat_penalty_for_chart'),
      London: londonHeatPenalty
    })
  ]);

  var chart = ui.Chart.feature.byFeature({
    features: comparisonFc,
    xProperty: 'metric',
    yProperties: ['Borough', 'London']
  })
    .setChartType('ColumnChart')
    .setOptions(mergeOptions(baseChartOptions(), {
      title: options.title || (boroughName + ' vs London average (red = borough, grey = London)'),
      colors: [COLORS.red, COLORS.grey],
      hAxis: {
        title: '',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        slantedText: true,
        slantedTextAngle: 20,
        gridlines: {color: COLORS.grid}
      },
      vAxis: {
        title: 'Indicator value',
        textStyle: {color: COLORS.text, fontSize: 12},
        titleTextStyle: {color: COLORS.text, fontSize: 12, italic: false},
        gridlines: {color: COLORS.grid}
      },
      legend: {
        position: 'right',
        textStyle: {color: COLORS.text, fontSize: 12}
      },
      chartArea: {
        left: 60,
        right: 20,
        top: 40,
        bottom: 55,
        width: '74%',
        height: '68%'
      }
    }));

  return chart;
};

// ============================================================================
// Export 4 — Ready-to-drop panel builder
// ============================================================================

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

  if (params.summaryFc) {
    panel.add(exports.wrapChart(
      exports.makeBoroughRankingChart(params.summaryFc, {topN: 10}),
      null
    ));
  }

  if (params.summaryFc && params.selectedBoroughName) {
    panel.add(exports.wrapChart(
      exports.makeBoroughIndicatorsChart(params.summaryFc, params.selectedBoroughName),
      null
    ));

    panel.add(exports.wrapChart(
      exports.makeBoroughVsLondonChart(params.summaryFc, params.selectedBoroughName),
      null
    ));
  } else {
    panel.add(exports.makeMessagePanel(
      'Borough-level charts',
      'Select a borough in the UI to show its key indicators and London comparison.'
    ));
  }

  return panel;
};