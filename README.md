# powerbi_visuals_globe_countries
Power BI Visual - Globe Countries

![Screenshot of the visual](assets/powerbi_visuals_globe_countries.gif)

This custom visual for Power BI allows you to create an interactive 3D globe using [Globe.gl](https://globe.gl/)

### Setting Up Environment

Before starting creating your first custom visual follow by [this](https://learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup)
setting up environment instruction.


### Install dev dependencies:

Once you have cloned this repository, run these commands to install dependencies and to connect the visual into powerbi.

```
npm install # This command will install all necessary modules
```

### Start dev app
```
pbiviz start
```

## v1.0.0.0 (preview)
- 3 fields: Country name, Tooltips, Color
- If the color field is numeric, color the choropleth as a heatmap
- Manage multiple tooltips
