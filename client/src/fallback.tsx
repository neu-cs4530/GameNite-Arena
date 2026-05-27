import { type FallbackProps } from "react-error-boundary";

/**
 * Using the error boundary component provided by
 * [react-error-boundary](https://www.npmjs.com/package/react-error-boundary)
 *
 * Wrapping the logged-in part of the application with this error boundary
 * mostly helps with development: without an error boundary, if you're editing
 * a component and you mistype a variable, the resulting
 * [ReferenceError](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ReferenceError)
 * may cause the router to reset the application to the login page.
 */
export default function fallback({ error }: FallbackProps) {
  return (
    <div className="content spacedSection">
      <div>There was an unexpected error in the application!</div>
      {error instanceof Error && (
        <>
          <div>
            Unexpected error {error.name}: {error.message}
          </div>
          <pre style={{ fontFamily: "monospace" }}>{error.stack}</pre>
          <div>There may be more details if you check the developer console</div>
        </>
      )}
    </div>
  );
}
