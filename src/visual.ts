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

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;

        this.dataMeasuresDisplayName = []
        this.dataMeasuresValue = []

        // Initialize Globe
        const earthNightBase64 = imagesJson['earth-night'];
        const earthDayBase64 = imagesJson['earth-day'];
        this.globe = Globe()(this.target)
            .globeImageUrl(earthDayBase64)
            .backgroundColor("#FFFFFF")
            .lineHoverPrecision(0);

        // Store the original GeoJSON data
        this.originalCountriesData = countriesGeoJson;


    }

    public update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);

        this.dataMeasuresDisplayName = []
        this.dataMeasuresValue = []

        // Get category data (country names or codes)
        const dataView = options.dataViews[0];
        if (dataView && dataView.categorical && dataView.categorical.categories) {
            const categories = dataView.categorical.categories[0].values;
            const measures = dataView.categorical.values ? dataView.categorical.values[0].values : [];

            dataView.categorical.values.forEach((element) => {
                this.dataMeasuresDisplayName.push(element.source.displayName)
                this.dataMeasuresValue.push(element.values)
            });

            // Filter the countries data based on categories
            const filteredCountries = this.filterCountriesByCategories(categories);

            // Map category (country name) to measure data
            const countryData = categories.map((category: any, index: number) => ({
                name: category,
                value: measures[index] !== undefined ? measures[index] : 0,
                orderIndex: index
            }));

            // Setup the globe with the GeoJSON data
            this.setupGlobe(this.originalCountriesData);

            this.updateChoropleth(filteredCountries, countryData);
        }
    }


    private setupGlobe(countries: any) {
        const colorScale = d3.scaleSequentialSqrt(d3.interpolateYlOrRd);
        const getVal = (feat: any) => feat.properties.GDP_MD_EST / Math.max(1e5, feat.properties.POP_EST);

        const maxVal = Math.max(...countries.features.map(getVal));
        colorScale.domain([0, maxVal]);

        this.globe
            .polygonsData(countries.features.filter((d: any) => d.properties.ISO_A2 !== 'AQ'))
            .polygonAltitude(0.06)
            .polygonCapColor("white")
            .polygonSideColor(() => 'rgba(0, 100, 0, 0.15)')
            .polygonStrokeColor(() => '#111')
            .polygonLabel(({ properties: d }: any) => {
                let tooltips = '';
                let index = 0;
                for (const key in d) {
                    const measureValue = this.dataMeasuresValue[index][d.orderIndex]
                    if (key.startsWith('tooltip')) {
                        tooltips += `${d[key]}: ${measureValue}<br />`;
                        index++;
                    }
                    
                }
                return `
                    <b>${d.ADMIN}:</b> <br />
                    Value: ${d.value !== undefined ? d.value : 'N/A'} <br />
                    ${tooltips}
                `;
            })
            .onPolygonHover((hoverD: any) => this.globe
                .polygonAltitude((d: any) => d === hoverD ? 0.12 : 0.06)
                .polygonCapColor((d: any) => d === hoverD ? 'white' : 'white')
            )
            .polygonsTransitionDuration(500);
    }



    private filterCountriesByCategories(categories: any) {
        return {
            ...this.originalCountriesData,
            features: this.originalCountriesData.features.filter((feature: any) =>
                categories.includes(feature.properties.ADMIN)
            )
        };
    }

    private updateChoropleth(filteredCountries: any, data: any) {
        const colorScale = d3.scaleSequentialSqrt(d3.interpolateYlOrRd);
        const maxVal = Math.max(...data.map((d: any) => d.value));
        colorScale.domain([0, maxVal]);

        filteredCountries.features.forEach((d: any) => {
            const countryData = data.find((item: any) => item.name === d.properties.ADMIN);
            if (countryData) {
                d.properties.value = countryData.value;
                d.properties.orderIndex = countryData.orderIndex
                this.dataMeasuresDisplayName.forEach((element, index) => {
                    d.properties["tooltip" + index] = element
                });
            }
        });

        this.globe
            .polygonsData(filteredCountries.features)
            .polygonCapColor((feat: any) => {
                const value = feat.properties.value || 0;
                return colorScale(value);
            });
    }



    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property.
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
