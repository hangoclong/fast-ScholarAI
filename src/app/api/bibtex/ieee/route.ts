import { NextRequest, NextResponse } from 'next/server';

// Sample BibTeX data for IEEE
const sampleIeeeBibTeX = `@INPROCEEDINGS{Zhang2023,
  author={Zhang, Wei and Li, Mei},
  booktitle={2023 IEEE International Conference on Data Science (ICDS)},
  title={Transformer Models for Natural Language Processing: A Survey},
  year={2023},
  volume={},
  number={},
  pages={78-85},
  doi={10.1109/ICDS.2023.12345}
}

@ARTICLE{Wang2022,
  author={Wang, Jing and Chen, Hui},
  journal={IEEE Transactions on Neural Networks and Learning Systems},
  title={Reinforcement Learning for Autonomous Driving: Challenges and Solutions},
  year={2022},
  volume={33},
  number={5},
  pages={2156-2170},
  doi={10.1109/TNNLS.2022.3156789}
}`;

// Handler for IEEE BibTeX API endpoint
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const keywords = searchParams.get('keywords') || '';
  const maxRecords = parseInt(searchParams.get('max_records') || '25');
  const startRecord = parseInt(searchParams.get('start_record') || '1');
  
  // Check if query parameter is provided
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }
  
  // In a real application, this would call the actual IEEE API
  // For now, we return mock data
  
  return NextResponse.json({
    total_results: 2, // Mock total results
    bibtex: sampleIeeeBibTeX
  });
}
