/**
 * Header logo — copies landing's NavBar `.nav-logo` pattern 1:1:
 * five animated wave bars + "GOLDEN_CONNECT" wordmark. Styles come from
 * `landing-v2.css` (.nav-logo-wave), we just repeat the markup.
 */
export function Logo() {
  return (
    <span className="nav-logo-wave" aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span>
  );
}
