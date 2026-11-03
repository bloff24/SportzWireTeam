export type Role = 'admin' | 'member';

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  approved: boolean;
  can_post_social: boolean;
  daily_post_cap: number;
  push_token: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  is_everyone: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  team_id: string;
  user_id: string;
  body: string | null;
  media_path: string | null;
  media_type: 'image' | 'video' | null;
  created_at: string;
};

export type Album = {
  id: string;
  team_id: string;
  title: string;
  created_by: string;
  created_at: string;
};

export type MediaItem = {
  id: string;
  album_id: string;
  team_id: string;
  user_id: string;
  path: string;
  type: 'image' | 'video';
  caption: string | null;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  created_by: string;
  created_at: string;
};

export type RsvpStatus = 'going' | 'maybe' | 'no';

export type SocialTarget = 'instagram' | 'facebook';

export type SocialPost = {
  id: string;
  author_id: string;
  caption: string;
  media_paths: string[];
  media_type: 'image' | 'video' | 'carousel';
  targets: SocialTarget[];
  status: 'pending' | 'publishing' | 'published' | 'rejected' | 'failed';
  error: string | null;
  ig_media_id: string | null;
  fb_post_id: string | null;
  reviewed_by: string | null;
  created_at: string;
  published_at: string | null;
};

export type SocialQuota = {
  can_post: boolean;
  personal: { used: number; limit: number } | null;
  instagram: { used: number; limit: number } | null;
  connected: boolean;
  instagram_connected: boolean;
};
