
# London Growth Cost Explorer

An interactive web application exploring where urban growth in London has occurred and what environmental cost has accompanied that growth.

## 🌍 Live Website
👉 https://your-username.github.io/your-repo-name/

## 🗺️ Interactive GEE Application
https://extreme-flame-493900-h7.projects.earthengine.app/view/london-growth-cost-explorer

---

## 📌 Project Overview

Urban expansion is often mapped simply as new built-up land, but this does not reveal what has been lost or whether certain areas experience disproportionately higher environmental impact.

This project goes beyond mapping growth by integrating multiple environmental indicators—including green loss, heat penalty, NDVI loss, and water-edge encroachment—into a composite **Growth Cost Index**. The application enables users to identify where urban growth is most environmentally costly and explore why these patterns occur across London boroughs.

---

## 🎯 Key Features

- Borough-level **Growth Cost Index ranking**
- Identification of **land types replaced by new built-up areas**
- Multi-dimensional comparison of environmental indicators
- Interactive **Earth Engine map interface**
- Linked **charts and narrative explanations** for interpretation

---

## 🧠 Method Overview

The analysis combines remote sensing and spatial aggregation:

1. Detect new built-up areas using land cover datasets  
2. Calculate environmental indicators (NDVI loss, heat penalty, water-edge encroachment)  
3. Aggregate results to borough level  
4. Construct a composite Growth Cost Index  
5. Visualise results through an interactive application and supporting charts  

---

## 🗂️ Repository Structure



├── index.qmd              # Quarto webpage source
├── docs/                  # Rendered site (GitHub Pages)
├── src/                   # Earth Engine scripts (A–F workflow)
├── data/                  # Borough-level datasets
├── styles.css             # Page styling



---

## 👥 Team Contributions

### Preprocessing
- **A**: Data acquisition and standardisation across multi-source datasets  
- **B**: Image preprocessing and ensuring spatial-temporal consistency  

### Analysis
- **C**: Land-use change detection and built-up area identification  
- **D**: Environmental indicator calculation and Growth Cost Index construction  

### Visualisation
- **E**: GEE interface design and interactive map development  
- **F**: Chart design, Quarto page development, front-end integration, and linking charts with the Earth Engine application for coordinated interpretation  

---

## ⚙️ Deployment

This project is built using **Quarto** and deployed via **GitHub Pages** from the `/docs` folder.

To rebuild locally:


---

## 📊 Data Sources

* Dynamic World (Google Earth Engine)
* Sentinel-2
* Landsat 8/9
* JRC Global Surface Water
* London Borough Boundaries

---

## 📎 Notes

This project was developed as part of CASA0025 (Spatial Data Science) at UCL.
