# Trip layer

Trip layer can display animated path.

![Trip layer](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/k-deckglTriplite.gif 'Grid layer')

**How to use trip layer to animate path**

**_Data format_**
Currently trip layer support a special geoJSON format where the coordinate linestring has a 4th element denoting timestamp. In order to animate the path, the geometry needs to be LineString rather than Polygon.

```
{
  type: 'FeatureCollection',
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-74.20986, 40.81773, (altitude=0), 1564184363],
          [-74.20987, 40.81765, (altitude=0), 1564184396],
          [-74.20998, 40.81746, (altitude=0), 1564184409]
        ]
      }
    }
  ]
}
```

Support for more data formats such as csv will be added soon.

**_Layer attributes_**

**_When there are multiple layers_**

- Multiple trip layers
  When you add multiple trip layers, the animation control will span the entire time range of those layers.

- Multiple layers containing trip layer and other layers
  You could add other static layers on top of trip layers. The trip-layer specific animation control will go away if you hide trip layer.

**_Export_**
To export an animated map, you can use a screen recording or gif capture tool. In futureFuture features such as gif exports.

![Polygon layer - buildings](https://d1a3f4spazzrp4.cloudfront.net/kepler.gl/documentation/layers-polygon-buildings.png 'Grid layer')

[Back to table of contents](../a-introduction.md)
