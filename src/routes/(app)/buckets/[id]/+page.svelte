<script lang="ts">
	import { page } from '$app/stores';
	import { fetchApi, uploadFileWithProgress, fileToBase64, formatBytes } from '$lib/api';
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import type { Bucket, FileItem } from '$lib/types';

	const queryClient = useQueryClient();
	const bucketId = $derived($page.params.id as string);

	// Fetch bucket info
	const bucketQuery = createQuery(() => ({
		queryKey: ['buckets', bucketId],
		queryFn: () => fetchApi<Bucket>(`/buckets/${bucketId}`)
	}));

	// Fetch files
	const filesQuery = createQuery(() => ({
		queryKey: ['buckets', bucketId, 'files'],
		queryFn: () =>
			fetchApi<{ data: FileItem[]; total: number }>(`/buckets/${bucketId}/files?limit=50`)
	}));

	let uploadProgress = $state<number | null>(null);
	let fileInputRef = $state<HTMLInputElement | null>(null);

	const uploadMutation = createMutation(() => ({
		mutationFn: async (file: File) => {
			const base64 = await fileToBase64(file);
			return uploadFileWithProgress(bucketId, file, base64, (progress) => {
				uploadProgress = progress;
			});
		},
		onSuccess: () => {
			toast.success('File uploaded successfully');
			queryClient.invalidateQueries({ queryKey: ['buckets', bucketId] });
			queryClient.invalidateQueries({ queryKey: ['buckets', bucketId, 'files'] });
		},
		onError: (error: Error) => {
			toast.error(error.message || 'Upload failed');
		},
		onSettled: () => {
			uploadProgress = null;
			if (fileInputRef) fileInputRef.value = '';
		}
	}));

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files || target.files.length === 0) return;

		const file = target.files[0];
		// Validate size locally (4MB limit as per backend)
		if (file.size > 4 * 1024 * 1024) {
			toast.error('File size exceeds 4MB limit');
			target.value = '';
			return;
		}

		uploadMutation.mutate(file);
	}

	function triggerFileInput() {
		fileInputRef?.click();
	}

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text).then(() => {
			toast.success('Copied to clipboard');
		});
	}
</script>

<div class="container mx-auto max-w-7xl space-y-8 p-4 md:p-6 lg:p-8">
	<!-- Header & Stats -->
	{#if bucketQuery.isPending}
		<div class="space-y-4">
			<Skeleton class="h-10 w-1/3" />
			<Skeleton class="h-6 w-1/4" />
		</div>
	{:else if bucketQuery.isError}
		<Card.Root class="border-destructive/50 bg-destructive/10">
			<Card.Content class="p-6">
				<p class="font-medium text-destructive">Failed to load vault details</p>
			</Card.Content>
		</Card.Root>
	{:else if bucketQuery.data}
		{@const b = bucketQuery.data}
		<div
			class="flex flex-col gap-6 border-b border-border pb-6 md:flex-row md:items-start md:justify-between"
		>
			<div>
				<div class="mb-2 flex items-center gap-3">
					<a href="/" class="text-muted-foreground transition-colors hover:text-foreground">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-arrow-left"
							><line x1="19" x2="5" y1="12" y2="12" /><polyline points="12 19 5 12 12 5" /></svg
						>
					</a>
					<h1 class="text-3xl font-bold tracking-tight">{b.displayName || b.githubRepoName}</h1>
				</div>
				<div class="ml-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-github"
							><path
								d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
							/><path d="M9 18c-4.51 2-5-2-7-2" /></svg
						>
						{b.githubRepoFullName}
					</span>
					<span class="flex items-center gap-1.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-file-image"
							><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path
								d="M14 2v4a2 2 0 0 0 2 2h4"
							/><circle cx="10" cy="12" r="2" /><path
								d="m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22"
							/></svg
						>
						{b.fileCount} / {b.maxFiles} files
					</span>
					<span class="flex items-center gap-1.5">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-hard-drive"
							><line x1="22" x2="2" y1="12" y2="12" /><path
								d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
							/><line x1="6" x2="6.01" y1="16" y2="16" /><line
								x1="10"
								x2="10.01"
								y1="16"
								y2="16"
							/></svg
						>
						{formatBytes(b.totalSizeBytes)} / {formatBytes(b.maxSizeBytes, 0)}
					</span>
				</div>
			</div>

			<div class="flex items-center">
				<input
					type="file"
					accept="image/*"
					class="hidden"
					bind:this={fileInputRef}
					onchange={handleFileSelect}
					disabled={uploadMutation.isPending || b.status === 'full'}
				/>
				<Button
					onclick={triggerFileInput}
					disabled={uploadMutation.isPending || b.status === 'full'}
					size="lg"
				>
					{#if uploadMutation.isPending}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-loader-2 mr-2 animate-spin"
							><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg
						>
						Uploading... {uploadProgress !== null ? `${uploadProgress}%` : ''}
					{:else if b.status === 'full'}
						Vault is Full
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="lucide lucide-upload mr-2"
							><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline
								points="17 8 12 3 7 8"
							/><line x1="12" x2="12" y1="3" y2="15" /></svg
						>
						Upload Image
					{/if}
				</Button>
			</div>
		</div>
	{/if}

	<!-- File Grid -->
	<div class="pt-2">
		{#if filesQuery.isPending}
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each Array(10) as _, i (i)}
					<Skeleton class="aspect-square w-full" />
				{/each}
			</div>
		{:else if filesQuery.isError}
			<div
				class="flex items-center justify-center rounded-lg border border-destructive/20 p-12 text-destructive"
			>
				Failed to load files: {filesQuery.error.message}
			</div>
		{:else if filesQuery.data?.data.length === 0}
			<div
				class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-20 text-center text-muted-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="lucide lucide-image-off mb-4 opacity-50"
					><line x1="2" x2="22" y1="2" y2="22" /><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" /><line
						x1="13.5"
						x2="6"
						y1="13.5"
						y2="21"
					/><line x1="18" x2="21" y1="12" y2="15" /><path
						d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59"
					/><path d="M21 15V5a2 2 0 0 0-2-2H9" /></svg
				>
				<p>No files uploaded yet.</p>
			</div>
		{:else}
			<div
				class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
			>
				{#each filesQuery.data?.data || [] as file (file.id)}
					<Card.Root class="group relative flex flex-col overflow-hidden">
						<div class="relative aspect-square overflow-hidden bg-muted/30">
							{#if file.mimeType?.startsWith('image/')}
								<img
									src={file.cdnUrl}
									alt={file.originalName}
									class="h-full w-full object-cover transition-transform group-hover:scale-105"
									loading="lazy"
								/>
							{:else}
								<div class="flex h-full w-full items-center justify-center text-muted-foreground">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="32"
										height="32"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="lucide lucide-file"
										><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path
											d="M14 2v4a2 2 0 0 0 2 2h4"
										/></svg
									>
								</div>
							{/if}

							<!-- Hover Overlay -->
							<div
								class="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
							>
								<Button
									size="icon"
									variant="secondary"
									onclick={() => copyToClipboard(file.cdnUrl)}
									title="Copy CDN Link"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="lucide lucide-copy"
										><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path
											d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
										/></svg
									>
								</Button>
								<Button
									size="icon"
									variant="secondary"
									href={file.cdnUrl}
									target="_blank"
									rel="noopener noreferrer"
									title="Open original"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="lucide lucide-external-link"
										><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path
											d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
										/></svg
									>
								</Button>
							</div>
						</div>
						<div class="flex flex-col border-t border-border p-2">
							<span class="truncate text-xs font-medium" title={file.originalName}
								>{file.originalName}</span
							>
							<span class="text-[0.65rem] text-muted-foreground">{formatBytes(file.sizeBytes)}</span
							>
						</div>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</div>
</div>
