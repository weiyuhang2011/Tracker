import { useParams } from "react-router-dom";
import { RepositoryBoard } from "../components/RepositoryBoard";
import type { Item } from "../api";

export function RepoPage(props: {
  items: Item[];
  onItemUpdated: (it: Item) => void;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSync?: () => void;
}) {
  const params = useParams();
  const repoFullName = params.repoFullName
    ? decodeURIComponent(params.repoFullName)
    : null;

  return (
    <RepositoryBoard
      items={props.items}
      onItemUpdated={props.onItemUpdated}
      loading={props.loading}
      error={props.error}
      onRefresh={props.onRefresh}
      onSync={props.onSync}
      initialRepo={repoFullName}
      initialKind="issue"
      initialState="open"
      showBackHome
    />
  );
}
