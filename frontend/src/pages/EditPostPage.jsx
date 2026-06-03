import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout.jsx";
import { getPost, updatePost } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function EditPostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { address } = useAuth();
  const [post, setPost] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPost = async () => {
      try {
        const data = await getPost(id);
        if (data.owner !== address) {
          setError("You do not have permission to edit this post");
          return;
        }
        setPost(data);
        setTitle(data.title || "");
        setContent(data.content || "");
      } catch (err) {
        setError(err.message || "Failed to load post");
      } finally {
        setIsLoading(false);
      }
    };
    loadPost();
  }, [id, address]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("Title and content are required");
      return;
    }

    setIsSaving(true);
    try {
      await updatePost(id, { title: title.trim(), content: content.trim() });
      navigate(`/post/${id}`);
    } catch (err) {
      alert("Failed to save post: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading)
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen">
          Loading...
        </div>
      </Layout>
    );
  if (error)
    return (
      <Layout>
        <div className="text-center p-4 text-red-400">{error}</div>
      </Layout>
    );

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Edit Post</h1>
        <form
          onSubmit={handleSave}
          className="flex flex-col gap-6 glass-panel rounded-3xl p-6"
        >
          <div>
            <label className="block text-sm font-bold mb-3">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-3">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={10}
              className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 px-6 py-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
