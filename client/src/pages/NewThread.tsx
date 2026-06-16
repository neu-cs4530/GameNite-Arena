import "./NewThread.css";
import useNewThreadForm from "../hooks/useNewThreadForm.ts";

export default function NewThread() {
  const { title, contents, err, handleInputChange, handleSubmit } = useNewThreadForm();

  return (
    <div className="ga-new-thread">
      <header className="ga-new-thread__hero">
        <h1>New post</h1>
        <p>Start a discussion with the community.</p>
      </header>
      <form className="ga-new-thread__form" onSubmit={handleSubmit}>
        <div className="ga-new-thread__field">
          <label className="ga-new-thread__label" htmlFor="thread-title">
            Title
          </label>
          <input
            id="thread-title"
            className="ga-new-thread__input"
            value={title}
            onChange={(e) => handleInputChange(e, "title")}
          />
        </div>
        <div className="ga-new-thread__field">
          <label className="ga-new-thread__label" htmlFor="thread-contents">
            Post contents
          </label>
          <textarea
            id="thread-contents"
            className="ga-new-thread__textarea"
            value={contents}
            onChange={(e) => handleInputChange(e, "contents")}
          />
        </div>
        {err && <p className="error-message">{err}</p>}
        <div>
          <button className="primary narrow">Create</button>
        </div>
      </form>
    </div>
  );
}
