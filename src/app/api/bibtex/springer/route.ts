import { NextRequest, NextResponse } from 'next/server';

// Sample BibTeX data for Springer
const sampleSpringerBibTeX = `@InCollection{Garcia2023,
  author = {Garcia, Maria and Rodriguez, Carlos},
  title = {Blockchain Technology in Supply Chain Management},
  booktitle = {Advances in Business Information Systems},
  publisher = {Springer},
  year = {2023},
  pages = {201-225},
  doi = {10.1007/978-3-030-12345-6_10}
}

@Article{Kim2022,
  author = {Kim, Soo-Jin and Park, Min-Ho},
  title = {Internet of Things Applications in Smart Cities},
  journal = {Journal of Urban Technology},
  publisher = {Springer},
  year = {2022},
  volume = {29},
  number = {4},
  pages = {312-330},
  doi = {10.1007/s12345-022-00789-x}
}`;

// Handler for Springer BibTeX API endpoint
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const keywords = searchParams.get('keywords') || '';
  const count = parseInt(searchParams.get('count') || '25');
  
  // Check if query parameter is provided
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }
  
  // In a real application, this would call the actual Springer API
  // For now, we return mock data
  
  return NextResponse.json({
    total_results: 2, // Mock total results
    bibtex: sampleSpringerBibTeX
  });
}
