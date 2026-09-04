import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export class ApiError extends Error {
	constructor(
		public status: number,
		public message: string
	) {
		super(message);
	}
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...options?.headers
		}
	});

	if (!res.ok) {
		if ((res.status === 401 || res.status === 403) && browser) {
			goto('/login');
		}

		let message = 'An error occurred';
		try {
			const data = await res.json();
			message = data.message || data.error || message;
		} catch {
			// ignore json parse error
		}
		throw new ApiError(res.status, message);
	}

	return res.json();
}

/**
 * Upload a file using XMLHttpRequest to track upload progress.
 */
export function uploadFileWithProgress<T = unknown>(
	bucketId: string,
	file: File,
	base64Content: string,
	onProgress: (progress: number) => void
): Promise<T> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `/api/buckets/${bucketId}/files`);
		xhr.setRequestHeader('Content-Type', 'application/json');

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				const percentComplete = Math.round((event.loaded / event.total) * 100);
				onProgress(percentComplete);
			}
		};

		xhr.onload = () => {
			if (xhr.status === 401 || xhr.status === 403) {
				if (browser) goto('/login');
				reject(new ApiError(xhr.status, 'Unauthorized'));
				return;
			}

			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const response = JSON.parse(xhr.responseText);
					resolve(response);
				} catch {
					resolve(xhr.responseText);
				}
			} else {
				let message = 'Upload failed';
				try {
					const response = JSON.parse(xhr.responseText);
					message = response.message || response.error || message;
				} catch {
					// ignore
				}
				reject(new ApiError(xhr.status, message));
			}
		};

		xhr.onerror = () => {
			reject(new ApiError(0, 'Network error occurred during upload'));
		};

		const payload = JSON.stringify({
			filename: file.name,
			mime_type: file.type,
			content: base64Content
		});

		xhr.send(payload);
	});
}

export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(file);
		reader.onload = () => {
			const result = reader.result as string;
			// Remove the Data URI prefix (e.g., "data:image/png;base64,")
			const base64 = result.split(',')[1];
			resolve(base64);
		};
		reader.onerror = (error) => reject(error);
	});
}

// Convert bytes to human readable format (KB, MB, GB)
export function formatBytes(bytes: number, decimals = 2) {
	if (!+bytes) return '0 Bytes';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
