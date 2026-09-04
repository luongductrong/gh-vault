<script lang="ts">
	import {
		ArrowLeft,
		Copy,
		ExternalLink,
		File as FileIcon,
		FileImage,
		GitBranch,
		HardDrive,
		ImageOff,
		LoaderCircle,
		Upload
	} from '@lucide/svelte';

	import { page } from '$app/state';
	import { fetchApi, uploadFileWithProgress, fileToBase64, formatBytes } from '$lib/api';
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import type { Bucket, FileItem } from '$lib/types';

	const queryClient = useQueryClient();
	const bucketId = $derived(page.params.id as string);

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
					<a
						href="/"
						class="text-muted-foreground transition-colors hover:text-foreground"
						aria-label="Back to vaults"
					>
						<ArrowLeft size={20} />
					</a>
					<h1 class="text-3xl font-bold tracking-tight">{b.displayName || b.githubRepoName}</h1>
				</div>
				<div class="ml-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<GitBranch class="mr-1" size={16} />
						{b.githubRepoFullName}
					</span>
					<span class="flex items-center gap-1.5">
						<FileImage size={16} />
						{b.fileCount} / {b.maxFiles} files
					</span>
					<span class="flex items-center gap-1.5">
						<HardDrive size={16} />
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
						<LoaderCircle size={16} class="mr-2 animate-spin" />
						Uploading... {uploadProgress !== null ? `${uploadProgress}%` : ''}
					{:else if b.status === 'full'}
						Vault is Full
					{:else}
						<Upload size={16} class="mr-2" />
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
				<ImageOff size={48} class="mb-4 opacity-50" />
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
									<FileIcon size={32} />
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
									<Copy size={16} />
								</Button>
								<Button
									size="icon"
									variant="secondary"
									href={file.cdnUrl}
									target="_blank"
									rel="noopener noreferrer"
									title="Open original"
								>
									<ExternalLink size={16} />
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
