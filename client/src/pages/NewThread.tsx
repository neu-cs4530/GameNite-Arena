import useNewThreadForm from "../hooks/useNewThreadForm.ts";

export default function NewThread() {
  const { title, contents, err, handleInputChange, handleSubmit } = useNewThreadForm();

  return (
    <form className="content spacedSection" onSubmit={handleSubmit}>
      <h2>Create new post</h2>
      <div className="tightSection">
        <div className="smallAndGray">Title</div>
        <input
          className="notTooWide widefill"
          value={title}
          onChange={(e) => handleInputChange(e, "title")}
        />
      </div>
      <div className="tightSection">
        <div className="smallAndGray">Post contents</div>
        <textarea
          className="notTooWide"
          style={{ minHeight: "10rem" }}
          value={contents}
          onChange={(e) => handleInputChange(e, "contents")}
        ></textarea>
      </div>
      {err && <p className="error-message">{err}</p>}
      <div>
        <button className="primary narrow">Create</button>
      </div>
    </form>
  );
}
