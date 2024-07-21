/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;

import { VisualFormattingSettingsModel } from "./settings";

import Globe from "globe.gl";
import * as d3 from "d3";
import * as THREE from "three";

// Import local GeoJSON file
const countriesGeoJson = require('../assets/geodata.json');
const imagesJson = require('../assets/images.json');

export class Visual implements IVisual {
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private globe: any;
    private originalCountriesData: any;

    private dataMeasuresDisplayName: Array<string>;
    private dataMeasuresValue: any;
    private dataColors: any;
    private dataCategories: any;
    private dataCategoriesSelections: any;

    private colorScale: any;

    private earthDisplay: any;

    private legendContainer: HTMLElement;

    private host: IVisualHost;
    private selectionManager: ISelectionManager;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;

        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();

        this.dataMeasuresDisplayName = [];
        this.dataMeasuresValue = [];
        this.dataColors = [];
        this.dataCategories = [];
        this.dataCategoriesSelections = [];

        // Initialize Globe
        this.earthDisplay = {
            "earth-day": imagesJson['earth-day'],
            "earth-night": imagesJson['earth-night'],
            "night-sky": imagesJson['night-sky'],
            "earth-blue-marble": imagesJson['earth-blue-marble'],
        }
        this.globe = Globe()(this.target)
            .globeImageUrl(this.earthDisplay["earth-blue-marble"])
            .backgroundColor("#FFFFFF")
            .lineHoverPrecision(0);

        // Store the original GeoJSON data
        this.originalCountriesData = countriesGeoJson;

        // Add resize event listener
        window.addEventListener('resize', () => this.onResize());

        this.createLegendContainer();
    }

    private createLegendContainer() {
        this.legendContainer = document.createElement('div');
        this.legendContainer.style.position = 'absolute';
        this.legendContainer.style.top = '10px';
        this.legendContainer.style.left = '10px';
        this.legendContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        this.legendContainer.style.padding = '10px';
        this.legendContainer.style.borderRadius = '5px';
        this.legendContainer.style.display = 'none';  // Hidden by default
        this.target.appendChild(this.legendContainer);
    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);

        this.dataMeasuresDisplayName = [];
        this.dataMeasuresValue = [];
        this.dataColors = [];
        this.dataCategories = [];
        this.dataCategoriesSelections = [];

        // Get category data (country names or codes)
        const dataView = options.dataViews[0];

        // Transform Data
        if (dataView && dataView.categorical && dataView.categorical.categories) {

            const categories = dataView.categorical.categories[0].values;
            this.dataCategories = categories;

            const categoriesSelect = dataView.categorical.categories;
            const categoriesCount = categoriesSelect[0].values.length;
            for (let categoryIndex = 0; categoryIndex < categoriesCount; categoryIndex++) {
                const categorySelectionId = this.host.createSelectionIdBuilder()
                    .withCategory(categoriesSelect[0], categoryIndex) // we have only one category (only one `Manufacturer` column)
                    .createSelectionId();
                this.dataCategoriesSelections.push(categorySelectionId)
            }

            if (dataView.categorical.values) {
                dataView.categorical.values.forEach((element) => {
                    if (element.source.roles.measure) {
                        this.dataMeasuresDisplayName.push(element.source.displayName);
                        this.dataMeasuresValue.push(element.values);
                    } else if (element.source.roles.color) {
                        this.dataColors = element.values;
                    }
                });
            }

            // Filter the countries data based on categories
            const filteredCountries = this.filterCountriesByCategories(categories);

            // Map category (country name) to measure data
            const countryData = categories.map((category: any, index: number) => ({
                name: category,
                orderIndex: index
            }));

            // Setup the globe with the GeoJSON data
            this.setupGlobe(this.originalCountriesData);

            this.updateChoropleth(filteredCountries, countryData);

            // Ensure the globe is centered after update
            this.centerGlobe();

            // Update legend if color data is present
            if (this.dataColors.length > 0) {
                this.updateLegend();
            } else {
                this.legendContainer.style.display = 'none';
            }
        } else {
            console.error("Country code data is missing.");
            this.clearGlobe();
        }
    }

    private setupGlobe(countries: any) {
        this.determineColorScale();

        this.globe
            .polygonsData(countries.features.filter((d: any) => d.properties.ISO_A2 !== 'AQ'))
            .globeImageUrl(this.earthDisplay[this.formattingSettings.dataPointCard.display.value as string])
            .backgroundColor(this.formattingSettings.dataPointCard.backgroundColor.value.value as string)
            .polygonAltitude(this.formattingSettings.dataPointCard.countriesAltitude.value * 0.01)
            .polygonCapColor((d: any) => {
                const value = d.properties.value ?? 0;
                return this.colorScale(value);
            })
            .polygonSideColor(() => 'rgba(0, 100, 0, 0.15)')
            .polygonStrokeColor(() => '#111')
            .polygonLabel(({ properties: d }: any) => this.createTooltip(d))
            .onPolygonHover((hoverD: any) => this.globe
                .polygonAltitude((d: any) => d === hoverD ? this.formattingSettings.dataPointCard.countriesAltitude.value * 0.01 + 0.05 : this.formattingSettings.dataPointCard.countriesAltitude.value * 0.01)
                .polygonCapColor((d: any) => d === hoverD ? 'white' : this.colorScale(d.properties.value))
            )
            .onPolygonClick((polygon: any) => this.handlePolygonClick(polygon))
            .polygonsTransitionDuration(500);

        if (this.formattingSettings.dataPointCard.nightSkyBackground.value) {
            this.globe.backgroundImageUrl(this.earthDisplay["night-sky"]);
        }
        else {
            this.globe.backgroundImageUrl("");
        }
    }

    private handlePolygonClick(polygon: any) {
        // console.log("Polygone cliqué : ", polygon.properties.ADMIN);
        const orderIndex = polygon.properties.orderIndex
        this.selectionManager.select(this.dataCategoriesSelections[orderIndex])
    }


    private updateChoropleth(filteredCountries: any, data: any) {
        const colorScale = d3.scaleSequentialSqrt(d3.interpolateYlOrRd);

        if (this.dataCategories.length > 0) {
            filteredCountries.features.forEach((d: any) => {
                const countryData = data.find((item: any) => item.name === d.properties.ADMIN);
                if (countryData) {
                    d.properties.orderIndex = countryData.orderIndex;
                    if (this.dataColors.length > 0) {
                        d.properties.value = this.dataColors[countryData.orderIndex] ?? 0;
                    }
                    this.dataMeasuresDisplayName.forEach((element, index) => {
                        d.properties["tooltip" + index] = element;
                    });
                }
            });

            this.globe
                .polygonsData(filteredCountries.features)
                .polygonCapColor((feat: any) => {
                    if (this.dataColors.length > 0) {
                        const value = feat.properties.value || 0;
                        return colorScale(value);
                    } else {
                        return 'rgba(0, 100, 0, 0.15)';
                    }
                });
        } else {
            console.error("Country code data is missing.");
            this.clearGlobe();
        }
    }

    private updateLegend() {
        // Clear existing legend items
        this.legendContainer.innerHTML = '';

        // Create legend items
        if (this.isNumeric(this.dataColors[0])) {
            const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
                .domain([Math.min(...this.dataColors), Math.max(...this.dataColors)]);

            // Assuming numerical color scale legend
            const steps = 5;
            const min = Math.min(...this.dataColors);
            const max = Math.max(...this.dataColors);
            const stepSize = (max - min) / steps;

            for (let i = 0; i <= steps; i++) {
                const value = min + i * stepSize;
                const color = colorScale(value);

                const legendItem = document.createElement('div');
                legendItem.style.display = 'flex';
                legendItem.style.alignItems = 'center';

                const colorBox = document.createElement('div');
                colorBox.style.width = '10px';
                colorBox.style.height = '10px';
                colorBox.style.backgroundColor = color;
                colorBox.style.marginRight = '10px';

                const label = document.createElement('span');
                label.innerText = value.toFixed(2);

                legendItem.appendChild(colorBox);
                legendItem.appendChild(label);
                this.legendContainer.appendChild(legendItem);
            }
        } else {
            const uniqueCategories = Array.from(new Set(this.dataColors)) as string[];

            uniqueCategories.forEach((category, index) => {
                const color = this.colorScale(category);

                const legendItem = document.createElement('div');
                legendItem.style.display = 'flex';
                legendItem.style.alignItems = 'center';

                const colorBox = document.createElement('div');
                colorBox.style.width = '10px';
                colorBox.style.height = '10px';
                colorBox.style.backgroundColor = color;
                colorBox.style.marginRight = '10px';

                const label = document.createElement('span');
                label.innerText = this.dataMeasuresDisplayName[index] || category;

                legendItem.appendChild(colorBox);
                legendItem.appendChild(label);
                this.legendContainer.appendChild(legendItem);
            });
        }

        // Show the legend
        this.legendContainer.style.display = 'block';
    }




    private createTooltip(d: any): string {
        if (this.dataMeasuresValue.length > 0) {
            let tooltips = '';
            let index = 0;
            for (const key in d) {
                const measureValue = (this.dataMeasuresValue[index] && this.dataMeasuresValue[index][d.orderIndex] !== undefined)
                    ? this.dataMeasuresValue[index][d.orderIndex]
                    : "";
                if (key.startsWith('tooltip') && measureValue !== "") {
                    tooltips += `${d[key]}: ${measureValue}<br />`;
                    index++;
                }
            }
            return `
            <div style="background-color:#585858; padding:5px; border-radius:2px; opacity:0.8">
                <b>${d.ADMIN}</b> <br />
                ${tooltips}</div>
            `;
        } else {
            return `<div style="background-color:#585858; padding:5px; border-radius:2px; opacity:0.8"><b>${d.ADMIN}</b>`;
        }
    }

    private onResize() {
        this.centerGlobe();
    }

    private centerGlobe() {
        const boundingRect = this.target.getBoundingClientRect();
        const centerX = boundingRect.width / 2;
        const centerY = boundingRect.height / 2;

        this.globe.width(boundingRect.width).height(boundingRect.height);
        this.globe.pointOfView({ lat: 0, lng: 0, altitude: 2.5 });
    }

    private clearGlobe() {
        this.globe
            .polygonsData([])
            .polygonCapColor(() => '#FFFFFF');
    }

    private filterCountriesByCategories(categories: any) {
        return {
            ...this.originalCountriesData,
            features: this.originalCountriesData.features.filter((feature: any) =>
                categories.includes(feature.properties.ADMIN)
            )
        };
    }

    private determineColorScale() {
        if (this.isNumeric(this.dataColors[0])) {
            const minVal = Math.min(...this.dataColors);
            const maxVal = Math.max(...this.dataColors);
            this.colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
                .domain([minVal, maxVal]);
        } else {
            const uniqueCategories = Array.from(new Set(this.dataColors)) as string[];
            this.colorScale = d3.scaleOrdinal(d3.schemeCategory10)
                .domain(uniqueCategories);
        }
    }




    private isNumeric(value: any): boolean {
        return !isNaN(value) && isFinite(value);
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }



}

