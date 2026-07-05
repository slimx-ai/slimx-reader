/**
 * Shows whether the app is in Local mode (data stays on this machine) or Cloud mode (selected
 * context may leave this machine). Driven by the API's `allow_cloud_providers` setting.
 */
export function LocalCloudBadge({ cloudEnabled }: { cloudEnabled: boolean }) {
  return (
    <span
      className={`mode-badge ${cloudEnabled ? 'mode-badge-cloud' : 'mode-badge-local'}`}
      title={
        cloudEnabled
          ? 'Cloud mode: selected context may leave this machine.'
          : 'Local mode: data stays on this machine.'
      }
    >
      <span className="mode-badge-dot" aria-hidden="true" />
      {cloudEnabled ? 'Cloud mode' : 'Local mode'}
    </span>
  );
}
