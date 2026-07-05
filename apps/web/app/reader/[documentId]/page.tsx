import { DocumentReader } from '../../../components/reader/DocumentReader';

export default function ReaderPage({ params }: { params: { documentId: string } }) {
  return <DocumentReader documentId={params.documentId} />;
}
