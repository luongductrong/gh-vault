export interface GitHubRepoResponse {
	id: number;
	node_id: string;
	name: string;
	full_name: string;
	private: boolean;
	owner: { login: string; id: number };
	html_url: string;
	description: string | null;
	default_branch: string;
}

export interface GitHubContentResponse {
	content: {
		name: string;
		path: string;
		sha: string;
		size: number;
		url: string;
		html_url: string;
		git_url: string;
		download_url: string | null;
		type: 'file' | 'dir' | 'symlink' | 'submodule';
	};
	commit: {
		sha: string;
		url: string;
		html_url: string;
		message: string;
		author: { name: string; email: string; date: string };
		committer: { name: string; email: string; date: string };
	};
}

export interface GitHubDirectoryItem {
	name: string;
	path: string;
	sha: string;
	size: number;
	url: string;
	html_url: string;
	git_url: string;
	download_url: string | null;
	type: 'file' | 'dir' | 'symlink' | 'submodule';
}

export interface RateLimitInfo {
	limit: number;
	remaining: number;
	reset: Date;
	used: number;
}
