import { NextRequest, NextResponse } from 'next/server';

// Sample BibTeX data for each database
const sampleBibTexData = {
  scopus: `@article{Smith2023,
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
}`,
  
  ieee: `@INPROCEEDINGS{Zhang2023,
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
}`,
  
  springer: `@InCollection{Garcia2023,
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
}`
};

// Handler for BibTeX API endpoints
export async function GET(request: NextRequest, { params }: { params: { database: string } }) {
  const database = params.database;
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  
  // Check if the database is valid
  if (!['scopus', 'ieee', 'springer'].includes(database)) {
    return NextResponse.json({ error: 'Invalid database' }, { status: 400 });
  }
  
  // Check if query parameter is provided
  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }
  
  // Return mock BibTeX data
  return NextResponse.json({
    total_results: 2, // Mock total results
    bibtex: sampleBibTexData[database as keyof typeof sampleBibTexData]
  });
}
