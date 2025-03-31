import { NextRequest, NextResponse } from 'next/server';

// Sample BibTeX data for Scopus
const sampleScopusBibTeX = `@article{Smith2023,
  author = {Smith, John and Johnson, Emily},
  title = {Advances in Machine Learning: A Comprehensive Review},
  journal = {Journal of Artificial Intelligence},
  year = {2023},
  volume = {45},
  number = {3},
  pages = {289-312},
  doi = {10.1234/jai.2023.45.3.289},
  abstract = {This paper provides a comprehensive review of recent advances in machine learning techniques and applications.}
}

@article{Brown2022,
  author = {Brown, Robert and Davis, Sarah},
  title = {Deep Learning Applications in Healthcare},
  journal = {Medical Informatics Journal},
  year = {2022},
  volume = {38},
  number = {2},
  pages = {145-168},
  doi = {10.1234/mij.2022.38.2.145},
  abstract = {This study examines the applications of deep learning techniques in healthcare and medical diagnosis.}
}`;

// Handler for Scopus BibTeX API endpoint
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const keywords = searchParams.get('keywords') || '';
  const count = parseInt(searchParams.get('count') || '25');
  
  // Check if query parameter is provided
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }
  
  // In a real application, this would call the actual Scopus API
  // For now, we return mock data
  
  return NextResponse.json({
    total_results: 2, // Mock total results
    bibtex: sampleScopusBibTeX
  });
}
