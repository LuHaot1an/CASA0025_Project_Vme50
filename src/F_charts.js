/**
 * F_charts.js
 * Chart module for London Growth Cost Explorer
 *
 * Author: F
 * Purpose:
 *   Build reusable Earth Engine ui.Chart objects for borough-level comparison.
 *
 * Expected inputs:
 *   1) rankingFc: ee.FeatureCollection with fields:
 *      - NAME
 *      - d_mean_growth_cost_index
 *
 *   2) transitionFc: ee.FeatureCollection with fields:
 *      - NAME
 *      - grass_to_built_km2
 *      - trees_to_built_km2
 *      - shrub_to_built_km2
 *      - crops_to_built_km2
 *      - water_to_built_km2
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
    water: '#80b1d3'
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
   * Add a total transition field for ranking boroughs by total replaced land.
   */
  function addTotalTransition(fc) {
    return ee.FeatureCollection(fc).map(function(ft) {
      var total = ee.Number(ft.get('grass_to_built_km2'))
        .add(ee.Number(ft.get('trees_to_built_km2')))
        .add(ee.Number(ft.get('shrub_to_built_km2')))
        .add(ee.Number(ft.get('crops_to_built_km2')))
        .add(ee.Number(ft.get('water_to_built_km2')));
  
      return ft.set('total_transition_km2', total);
    });
  }
  
  /**
   * Convert a borough feature into a FeatureCollection of land-type records.
   * Useful for borough-specific pie charts.
   */
  function boroughToLandTypeFc(feature) {
    return ee.FeatureCollection([
      ee.Feature(null, {
        land_type: 'Grass',
        area_km2: ee.Number(feature.get('grass_to_built_km2'))
      }),
      ee.Feature(null, {
        land_type: 'Trees',
        area_km2: ee.Number(feature.get('trees_to_built_km2'))
      }),
      ee.Feature(null, {
        land_type: 'Shrub',
        area_km2: ee.Number(feature.get('shrub_to_built_km2'))
      }),
      ee.Feature(null, {
        land_type: 'Crops',
        area_km2: ee.Number(feature.get('crops_to_built_km2'))
      }),
      ee.Feature(null, {
        land_type: 'Water',
        area_km2: ee.Number(feature.get('water_to_built_km2'))
      })
    ]);
  }
  
  // ============================================================================
  // Export 1 — Top 10 borough ranking chart
  // ============================================================================
  
  /**
   * Create a horizontal bar chart of the top 10 boroughs by growth cost index.
   *
   * @param {ee.FeatureCollection} rankingFc
   * @return {ui.Chart}
   */
  exports.makeBoroughRankingChart = function(rankingFc) {
    var top10 = ee.FeatureCollection(rankingFc)
      .filter(ee.Filter.notNull(['NAME', 'd_mean_growth_cost_index']))
      .sort('d_mean_growth_cost_index', false)
      .limit(10);
  
    var chart = ui.Chart.feature.byFeature({
      features: top10,
      xProperty: 'NAME',
      yProperties: ['d_mean_growth_cost_index']
    })
      .setChartType('BarChart')
      .setOptions(mergeOptions(baseChartOptions(), {
        title: 'Top 10 Boroughs by Environmental Growth Cost Index',
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
   * @return {ui.Chart}
   */
  exports.makeReplacedLandChart = function(transitionFc) {
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
      .limit(8);
  
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
        title: 'Land Types Replaced by New Built-up Areas',
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
  // Export 3 — Optional single-borough pie chart
  // ============================================================================
  
  /**
   * Create a borough-specific pie chart showing replaced land composition.
   *
   * @param {ee.FeatureCollection} transitionFc
   * @param {string} boroughName
   * @return {ui.Chart}
   */
  exports.makeSingleBoroughPieChart = function(transitionFc, boroughName) {
    var borough = ee.Feature(
      ee.FeatureCollection(transitionFc)
        .filter(ee.Filter.eq('NAME', boroughName))
        .first()
    );
  
    var landTypeFc = boroughToLandTypeFc(borough);
  
    var chart = ui.Chart.feature.byFeature({
      features: landTypeFc,
      xProperty: 'land_type',
      yProperties: ['area_km2']
    })
      .setChartType('PieChart')
      .setOptions({
        title: 'Land Types Replaced in ' + boroughName,
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