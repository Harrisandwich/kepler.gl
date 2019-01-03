// Copyright (c) 2018 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import memoize from 'lodash.memoize';
import uniq from 'lodash.uniq';

import Layer from '../base-layer';
import HighlightPolygonLayer from 'deckgl-layers/geojson-layer/solid-polygon-layer';
import {GeoJsonLayer as DeckGLGeoJsonLayer} from 'deck.gl';
import {hexToRgb} from 'utils/color-utils';
import {
  getGeojsonDataMaps,
  getGeojsonBounds,
  featureToDeckGlGeoType
} from './geojson-utils';
import GeojsonLayerIcon from './geojson-layer-icon';
import {GEOJSON_FIELDS, CHANNEL_SCALES} from 'constants/default-settings';

export const geojsonVisConfigs = {
  opacity: 'opacity',
  strokeOpacity: 'opacity',
  thickness: {
    type: 'number',
    defaultValue: 0.5,
    label: 'Stroke Width',
    isRanged: false,
    range: [0, 100],
    step: 0.1,
    group: 'stroke',
    property: 'thickness'
  },
  colorRange: 'colorRange',
  targetColor: 'targetColor',
  strokeColorRange: 'colorRange',
  radius: 'radius',

  sizeRange: 'strokeWidthRange',
  radiusRange: 'radiusRange',
  heightRange: 'elevationRange',
  elevationScale: 'elevationScale',

  'hi-precision': 'hi-precision',
  stroked: 'stroked',
  filled: 'filled',
  enable3d: 'enable3d',
  wireframe: 'wireframe'
};

export const geoJsonRequiredColumns = ['geojson'];
export const featureAccessor = ({geojson}) => d => d[geojson.fieldIdx];
export const featureResolver = ({geojson}) => geojson.fieldIdx;

const defaultDataAccessor = d => d.data;
const nullValueColor = [0, 0, 0, 0];
const nullValueSize = 0;


// kepler.gl uses constantValue(this.config) to return new value in updateTriggers
// when constantValue(this.config returns an accessor function, shallow equal will be false
// to avoid updating the entire buffer, we check config.color has changed or not,
// if not return the same accessor function
// const getFillColorConstant = memoize(config => d => d.properties.fillColor || config.color, config => config.color);
const constantValueAccessors = {
  color: {
    accessor: config => d => d.properties.fillColor || config.color,
    resolver: config => config.color
  },
  strokeColor: {
    accessor: config => d => d.properties.lineColor || config.visConfig.strokeColor || config.color,
    resolver: config => `${config.strokeColor}${config.color}`
  }
};

const getSizeConstant = d => d.properties.lineWidth || 1;
const getHeightConstant = d => d.properties.elevation || 500;
const getRadiusConstant = d => d.properties.radius || 1;

const visualChannels = {
  color: {
    property: 'fill color',
    field: 'colorField',
    scale: 'colorScale',
    domain: 'colorDomain',
    range: 'colorRange',
    key: 'color',
    channelScaleType: CHANNEL_SCALES.color,
    condition: config => config.visConfig.filled,
    accessor: 'getFillColor',
    nullValue: nullValueColor,
    constantValue: null
  },
  strokeColor: {
    property: 'stroke color',
    field: 'strokeColorField',
    scale: 'strokeColorScale',
    domain: 'strokeColorDomain',
    range: 'strokeColorRange',
    key: 'strokeColor',
    channelScaleType: CHANNEL_SCALES.color,
    condition: config => config.visConfig.stroked,
    accessor: 'getLineColor',
    nullValue: nullValueColor,
    constantValue: null
  },
  size: {
    property: 'stroke',
    field: 'sizeField',
    scale: 'sizeScale',
    domain: 'sizeDomain',
    range: 'sizeRange',
    key: 'size',
    channelScaleType: CHANNEL_SCALES.size,
    condition: config => config.visConfig.stroked,
    accessor: 'getLineWidth',
    nullValue: nullValueSize,
    constantValue: config => getSizeConstant
  },
  height: {
    property: 'height',
    field: 'heightField',
    scale: 'heightScale',
    domain: 'heightDomain',
    range: 'heightRange',
    key: 'height',
    channelScaleType: 'size',
    condition: config => config.visConfig.enable3d,
    accessor: 'getElevation',
    nullValue: nullValueSize,
    constantValue: config => getHeightConstant
  },
  radius: {
    property: 'radius',
    field: 'radiusField',
    scale: 'radiusScale',
    domain: 'radiusDomain',
    range: 'radiusRange',
    key: 'radius',
    channelScaleType: 'radius',
    accessor: 'getRadius',
    nullValue: nullValueSize,
    constantValue: config => getRadiusConstant
  }
};

export default class GeoJsonLayer extends Layer {
  constructor(props) {
    super(props);

    this.dataToFeature = {};
    this.registerVisConfig(geojsonVisConfigs);
    this._visualChannels = this.initiateVisualChannels();
    this.getFeature = memoize(featureAccessor, featureResolver);
  }

  get type() {
    return 'geojson';
  }

  get name() {
    return 'Polygon';
  }

  get layerIcon() {
    return GeojsonLayerIcon;
  }

  get requiredLayerColumns() {
    return geoJsonRequiredColumns;
  }

  static findDefaultLayerProps({label, fields}) {
    const geojsonColumns = fields
      .filter(f => f.type === 'geojson')
      .map(f => f.name);

    const defaultColumns = {
      geojson: uniq([...GEOJSON_FIELDS.geojson, ...geojsonColumns])
    };

    const foundColumns = this.findDefaultColumnField(defaultColumns, fields);
    if (!foundColumns || !foundColumns.length) {
      return [];
    }

    return foundColumns.map(columns => ({
      label: typeof label === 'string' && label.replace(/\.[^/.]+$/, '') || this.type,
      columns,
      isVisible: true
    }));
  }

  getDefaultLayerConfig(props = {}) {
    return {
      ...super.getDefaultLayerConfig(props),

      // add stroke color channel
      strokeColorField: null,
      strokeColorDomain: [0, 1],
      strokeColorScale: 'quantile',

      // add height visual channel
      heightField: null,
      heightDomain: [0, 1],
      heightScale: 'linear',

      // add radius visual channel
      radiusField: null,
      radiusDomain: [0, 1],
      radiusScale: 'linear'
    };
  }

  initiateVisualChannels() {
    const constantValues = Object.keys(constantValueAccessors).reduce((accu, key) => ({
      ...accu,
      [key]: memoize(constantValueAccessors[key].accessor, constantValueAccessors[key].resolver)
    }), {});
    const merged = Object.keys(visualChannels).reduce((accu, key) => ({
      ...accu,
      [key]: constantValues[key] ? {
        ...visualChannels[key],
        constantValue: constantValues[key]
      } : visualChannels[key]
    }), {});

    return merged;
  }

  getHoverData(object, allData) {
    // index of allData is saved to feature.properties
    return allData[object.properties.index];
  }

  shouldCalculateDeckLayerData(oldLayerData, opt, geometryAccessors) {
    // geometryAccessors is accessors that returns position, feature, hexId
    // change to geometryAccessors will result in regenerate the entire layer data array
    if (!oldLayerData || !oldLayerData.data) {
      return true;
    }
    return oldLayerData &&
      opt.sameData &&
      oldLayerData.getFeature === getFeature &&
      oldLayerData.data;
  }

  calculateDeckLayerData(data, allData, filteredIndex, dataToFeature) {
    return filteredIndex
      .map(i => dataToFeature[i])
      .filter(d => d);
  }

  shouldUpdateLayerMeta(oldLayerData, geometryAccessors) {
    if (!oldLayerData) {
      return true;
    }

    for (let key in geometryAccessors) {
      if (oldLayerData[key] !== geometryAccessors[key]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mapping from visual channels to deck.gl attribute accesors
   * @param {Function} dataAccessor - access kepler.gl layer data from deck.gl layer
   * @return {Object} attributeAccessors - deck.gl layer attribute accessors
   */
  getAtributeAccessors(dataAccessor = defaultDataAccessor) {
    const attributeAccessors = {};

    for (let key in this.visualChannels) {
      const {condition, field, scale, domain, range, accessor, constantValue,
        nullValue, channelScaleType} = this.visualChannels[key];
      const disabled = condition && !condition(this.config);

      const scaleFunction = this.config[field] && !disabled &&
        this.getVisChannelScale(
          this.config[scale],
          this.config[domain],
          // convert from hex to rgb if color
          // TODO: Shan refactor to remove this code
          channelScaleType ===  CHANNEL_SCALES.color ?
          this.config.visConfig[range].colors.map(hexToRgb) : this.config.visConfig[range]
        );

      attributeAccessors[accessor] = scaleFunction ? d =>
        // return an accessor function
        this.getEncodedChannelValue(
          scaleFunction,
          dataAccessor(d),
          this.config[field],
          nullValue
        )
        // return a constant
        : typeof constantValue === 'function' ?
        constantValue(this.config) : constantValue
    }

    return attributeAccessors;
  }

  getUpdateTriggers() {
    const updateTriggers = {};
    for (let key in this.visualChannels) {
      if (this.visualChannels.hasOwnProperty(key)) {
        const {accessor, field, scale, range, domain, constantValue} = this.visualChannels[key];

        updateTriggers[accessor] = {
          [field]: this.config[field],
          [scale]: this.config[scale],
          [range]: this.config[range],
          [domain]: this.config[domain],
          constant: typeof constantValue === 'function' ? constantValue(this.config) : constantValue
        };
      }
    }

    return updateTriggers;
  }

  getGeometryAccessors() {
    return {
      getFeature: this.getFeature(this.config.columns)
    };
  }

  formatLayerData(_, allData, filteredIndex, oldLayerData, opt = {}) {
    // const {columns} = this.config;
    // const getFeature = this.getFeature(columns);
    const geometryAccessors = this.getGeometryAccessors();

    // geojson feature are object, if doesn't exists
    // create it and save to layer
    if (this.shouldUpdateLayerMeta(oldLayerData, geometryAccessors)) {
      this.updateLayerMeta(allData, geometryAccessors);
    }

    let layerData;
    const carryoverOldData = this.shouldCalculateDeckLayerData(oldLayerData, opt, geometryAccessors);
    if (carryoverOldData) {
      // no need to create a new array of data
      // use updateTriggers to selectively re-calculate attributes
      layerData = carryoverOldData;
    } else {
      // filteredIndex is a reference of index in allData which can map to feature
      // here we create a new array of data, this will cause all deck.gl attributes being invalidated
      layerData = this.calculateDeckLayerData(_, allData, filteredIndex, this.dataToFeature)
    }

    // access keplergl layer data from deck.gl layer
    const dataAccessor = d => allData[d.properties.index];

    const accessors = this.getAtributeAccessors(dataAccessor)

    return {
      data: layerData,
      getFeature,
      ...accessors
    };
  }

  updateLayerMeta(allData, {getFeature}) {
    this.dataToFeature = getGeojsonDataMaps(allData, getFeature);

    // calculate layer meta
    const allFeatures = Object.values(this.dataToFeature);

    // get bounds from features
    const bounds = getGeojsonBounds(allFeatures);

    // get lightSettings from points
    const lightSettings = this.getLightSettingsFromBounds(bounds);

    // if any of the feature has properties.hi-precision set to be true
    const fp64 = Boolean(
      allFeatures.find(d => d && d.properties && d.properties['hi-precision'])
    );
    const fixedRadius = Boolean(
      allFeatures.find(d => d && d.properties && d.properties.radius)
    );

    // keep a record of what type of geometry the collection has
    const featureTypes = allFeatures.reduce((accu, f) => {
      const geoType = featureToDeckGlGeoType(
        f && f.geometry && f.geometry.type
      );

      if (geoType) {
        accu[geoType] = true;
      }
      return accu;
    }, {});

    this.updateMeta({bounds, lightSettings, fp64, fixedRadius, featureTypes});
  }

  renderLayer({
    data,
    idx,
    objectHovered,
    mapState,
    interactionConfig
  }) {
    const {fp64, lightSettings, fixedRadius} = this.meta;
    const radiusScale = this.getRadiusScaleByZoom(mapState, fixedRadius);
    const zoomFactor = this.getZoomFactor(mapState);
    const {visConfig} = this.config;

    const layerProps = {
      // multiplier applied just so it being consistent with previously saved maps
      lineWidthScale: visConfig.thickness * zoomFactor * 8,
      lineWidthMinPixels: 1,
      elevationScale: visConfig.elevationScale,
      pointRadiusScale: radiusScale,
      fp64: fp64 || visConfig['hi-precision'],
      lineMiterLimit: 4
    };

    const updateTriggers = this.getUpdateTriggers();

    return [
      new DeckGLGeoJsonLayer({
        ...layerProps,
        id: this.id,
        idx,
        data: data.data,
        getFillColor: data.getFillColor,
        getLineColor: data.getLineColor,
        getLineWidth: data.getLineWidth,
        getRadius: data.getRadius,
        getElevation: data.getElevation,
        // highlight
        pickable: true,
        // highlightColor: this.config.highlightColor,
        autoHighlight: visConfig.enable3d,
        // parameters
        parameters: {depthTest: Boolean(visConfig.enable3d || mapState.dragRotate)},
        opacity: visConfig.opacity,
        stroked: visConfig.stroked,
        filled: visConfig.filled,
        extruded: visConfig.enable3d,
        wireframe: visConfig.wireframe,
        lightSettings,
        updateTriggers,

        subLayers: {
          ...DeckGLGeoJsonLayer.defaultProps.subLayers,
          PolygonLayer: HighlightPolygonLayer
        }
      }),
      ...(this.isLayerHovered(objectHovered) && !visConfig.enable3d
        ? [
            new DeckGLGeoJsonLayer({
              ...layerProps,
              id: `${this.id}-hovered`,
              data: [objectHovered.object],
              getLineWidth: data.getLineWidth,
              getRadius: data.getRadius,
              getElevation: data.getElevation,
              getLineColor: this.config.highlightColor,
              getFillColor: this.config.highlightColor,
              updateTriggers,
              stroked: true,
              pickable: false,
              filled: false
            })
          ]
        : [])
    ];
  }
}
