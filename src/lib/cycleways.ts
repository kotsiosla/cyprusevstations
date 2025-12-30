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
    
    // Parse the XML structure to extract cycleways
    // The data contains cycling infrastructure with coordinates
    const features = xmlDoc.querySelectorAll('cyclewayFacility, CyclewayFacility, member');
    
    if (features.length === 0) {
      // Fallback: parse as raw text and extract data patterns
      const rawData = xmlText;
      const patterns = rawData.matchAll(/Ποδηλατική Υποδομή[^<]*([\d.]+)/g);
      
      // Extract meaningful segments from the XML
      const segments = rawData.split('Ποδηλατική Υποδομή');
      
      segments.forEach((segment, index) => {
        if (index === 0) return; // Skip first empty segment
        
        const nameMatch = segment.match(/^-?([^<\d]+)/);
        const name = nameMatch ? nameMatch[1].trim().replace(/^-/, '').trim() : `Cycleway ${index}`;
        
        // Extract coordinates (pairs of lat/lng)
        const coordMatches = segment.matchAll(/(3[45]\.[\d]+)/g);
        const coords: number[] = [];
        for (const match of coordMatches) {
          coords.push(parseFloat(match[1]));
        }
        
        // Group coordinates into pairs [lat, lng]
        const coordinates: [number, number][] = [];
        for (let i = 0; i < coords.length - 1; i += 2) {
          const lat = coords[i];
          const lng = coords[i + 1];
          if (lat >= 34 && lat <= 36 && lng >= 32 && lng <= 35) {
            coordinates.push([lng, lat]); // GeoJSON uses [lng, lat]
          }
        }
        
        if (coordinates.length >= 2) {
          cycleways.push({
            id: `cycleway-${index}`,
            name: name || `Cycleway Section ${index}`,
            coordinates,
            language: 'el'
          });
        }
      });
    }
    
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
