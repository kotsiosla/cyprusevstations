export interface Cycleway {
  id: string;
  name: string;
  coordinates: [number, number][];
  language: string;
}

export async function fetchCycleways(): Promise<Cycleway[]> {
  try {
    const response = await fetch('https://fixcyprus.cy/gnosis/open/api/nap/datasets/cycleways/');
    const xmlText = await response.text();
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    const cycleways: Cycleway[] = [];
    
    // The XML uses namespaces, so we need to use getElementsByTagNameNS or parse by local name
    const linearElements = xmlDoc.querySelectorAll('linearElement');
    
    linearElements.forEach((element, index) => {
      // Get name - look for value element inside name
      const nameElement = element.querySelector('name value');
      let name = nameElement?.textContent || `Cycleway ${index + 1}`;
      
      // Clean up the name - remove prefix if present
      name = name.replace('Ποδηλατική Υποδομή-', '').trim();
      
      // Get language
      const langElement = element.querySelector('name lang');
      const language = langElement?.textContent || 'el';
      
      // Get ID
      const idElement = element.querySelector('id');
      const id = idElement?.textContent || `cycleway-${index}`;
      
      // Get coordinates from pointCoordinates
      const coordElements = element.querySelectorAll('pointCoordinates');
      const coordinates: [number, number][] = [];
      
      coordElements.forEach((coord) => {
        const latEl = coord.querySelector('latitude');
        const lngEl = coord.querySelector('longitude');
        
        if (latEl && lngEl) {
          const lat = parseFloat(latEl.textContent || '0');
          const lng = parseFloat(lngEl.textContent || '0');
          
          // Validate coordinates are in Cyprus region
          if (lat >= 34 && lat <= 36 && lng >= 32 && lng <= 35) {
            coordinates.push([lng, lat]); // GeoJSON uses [lng, lat]
          }
        }
      });
      
      if (coordinates.length >= 2) {
        cycleways.push({
          id: `cycleway-${id}`,
          name,
          coordinates,
          language
        });
      }
    });
    
    console.log(`Loaded ${cycleways.length} cycleways from API`);
    return cycleways;
  } catch (error) {
    console.error('Error fetching cycleways:', error);
    return [];
  }
}

// Hardcoded sample data for immediate display while API loads
export const sampleCycleways: Cycleway[] = [
  {
    id: 'sample-1',
    name: 'Εμμανουήλ Ροίδη (Emmanuel Roidi)',
    coordinates: [[33.044217, 34.684879], [33.045268, 34.685107], [33.046298, 34.685322], [33.047669, 34.685618]],
    language: 'el'
  },
  {
    id: 'sample-2', 
    name: 'Πλάτωνος (Platonos)',
    coordinates: [[33.044156, 34.685721], [33.043963, 34.685753], [33.043722, 34.686306], [33.043473, 34.686866]],
    language: 'el'
  },
  {
    id: 'sample-3',
    name: 'Κωστή Παλαμά (Kosti Palama)',
    coordinates: [[33.037875, 34.703437], [33.038058, 34.703182], [33.038199, 34.702860], [33.038308, 34.702635]],
    language: 'el'
  },
  {
    id: 'sample-4',
    name: 'Λεωφ. Σπύρου Κυπριανού (Spyros Kyprianou Ave)',
    coordinates: [[33.028178, 34.694418], [33.029632, 34.695143]],
    language: 'el'
  },
  {
    id: 'sample-5',
    name: 'Walt Disney',
    coordinates: [[33.016122, 34.691897], [33.015473, 34.691615], [33.014687, 34.691739], [33.014370, 34.691927]],
    language: 'el'
  },
];
