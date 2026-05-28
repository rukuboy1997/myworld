import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import PostCard from '../components/PostCard.jsx';
import { getPost } from '../lib/api.js';

export default function PostPage() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPost() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getPost(id);
        if (cancelled) return;
        setPost({
          ...data,
          commentCount: Array.isArray(data.comments) ? data.comments.length : data.commentCount || 0,
        });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load post');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadPost();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full px-4 py-8">
        {isLoading ? (
          <div className="glass-panel rounded-3xl p-6 h-64 animate-pulse bg-white/5" />
        ) : error ? (
          <div className="glass-panel rounded-3xl p-10 text-center flex flex-col items-center gap-4 border-destructive/30">
            <div>
              <h1 className="text-xl font-bold mb-2">Post not found</h1>
              <p className="text-muted-foreground">{error}</p>
            </div>
            <Link to="/feed" className="mt-2 px-6 py-2 bg-secondary text-secondary-foreground rounded-full font-medium hover:bg-secondary/80 transition-colors">
              Back to feed
            </Link>
          </div>
        ) : (
          <PostCard post={post} />
        )}
      </div>
    </Layout>
  );
}
