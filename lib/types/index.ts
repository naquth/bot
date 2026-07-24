export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  is_admin: boolean;
  is_verified: boolean;
  created_at: string;
};

export type PostVisibility = "public" | "followers" | "private";

export type Post = {
  id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  video_url: string | null;
  video_width: number | null;
  video_height: number | null;
  video_duration_sec: number | null;
  video_thumbnail_url: string | null;
  edited_at: string | null;
  quote_post_id: string | null;
  quoted_post: QuotedPost | null;
  pinned_at: string | null;
  view_count: number;
  poll: Poll | null;
  visibility: PostVisibility;
  created_at: string;
  author: Profile;
  like_count: number;
  reply_count: number;
  liked_by_me: boolean;
  bookmarked_by_me: boolean;
};

export type Poll = {
  id: string;
  closes_at: string;
  options: PollOption[];
  total_votes: number;
  my_vote_option_id: string | null;
};

export type PollOption = {
  id: string;
  label: string;
  position: number;
  vote_count: number;
};

export type QuotedPost = {
  id: string;
  content: string;
  image_url: string | null;
  author: { username: string; display_name: string; avatar_url: string | null };
  deleted: boolean;
};

export type Story = {
  id: string;
  author_id: string;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  video_url: string | null;
  video_width: number | null;
  video_height: number | null;
  video_duration_sec: number | null;
  caption: string;
  bg_color: string;
  view_count: number;
  created_at: string;
  expires_at: string;
  viewed_by_me: boolean;
};

export type StoryGroup = {
  author: Profile;
  stories: Story[];
  allViewed: boolean;
};

export type NotificationType = "like" | "reply" | "follow";

export type AppNotification = {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  post_id: string | null;
  actor: Profile;
};

export type PostDraft = {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  image_width: number | null;
  image_height: number | null;
  video_url: string | null;
  video_width: number | null;
  video_height: number | null;
  video_duration_sec: number | null;
  video_thumbnail_url: string | null;
  poll_options: string[] | null;
  poll_duration_hours: number | null;
  visibility: PostVisibility;
  parent_id: string | null;
  quote_post_id: string | null;
  created_at: string;
  updated_at: string;
};

