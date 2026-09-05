<script lang="ts">
	import {
		ArrowLeft,
		Copy,
		Eye,
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
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Dialog, DialogContent, DialogTitle, DialogDescription } from '$lib/components/ui/dialog';
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
	let previewFile = $state<FileItem | null>(null);
	let isPreviewOpen = $state(false);

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

	function openPreview(file: FileItem) {
		previewFile = file;
		isPreviewOpen = true;
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
		<Card class="border-destructive/50 bg-destructive/10">
			<CardContent class="p-6">
				<p class="font-medium text-destructive">Failed to load vault details</p>
			</CardContent>
		</Card>
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
					<a
						href="https://github.com/{b.githubRepoFullName}"
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1.5 transition-colors hover:text-foreground"
					>
						<GitBranch class="mr-1" size={16} />
						{b.githubRepoFullName}
					</a>
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

	<!-- File List -->
	<div class="pt-2">
		{#if filesQuery.isPending}
			<div class="flex flex-col divide-y divide-border rounded-lg border border-border">
				{#each Array(8) as _, i (i)}
					<div class="flex items-center gap-4 px-4 py-3">
						<Skeleton class="size-8 shrink-0" />
						<Skeleton class="h-4 flex-1" />
						<Skeleton class="h-4 w-16 shrink-0" />
					</div>
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
			<div class="overflow-hidden rounded-lg border border-border">
				<table class="w-full text-sm">
					<thead>
						<tr
							class="border-b border-border bg-muted/40 text-left text-xs tracking-wider text-muted-foreground uppercase"
						>
							<th class="px-4 py-2.5">File</th>
							<th class="hidden px-4 py-2.5 md:table-cell">Type</th>
							<th class="hidden px-4 py-2.5 sm:table-cell">Size</th>
							<th class="hidden px-4 py-2.5 lg:table-cell">Uploaded</th>
							<th class="px-4 py-2.5 text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each filesQuery.data?.data || [] as file (file.id)}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										{#if file.mimeType?.startsWith('image/')}
											<FileImage size={18} class="shrink-0 text-muted-foreground" />
										{:else}
											<FileIcon size={18} class="shrink-0 text-muted-foreground" />
										{/if}
										<span class="max-w-48 truncate font-medium" title={file.originalName}>
											{file.originalName}
										</span>
									</div>
								</td>
								<td class="hidden px-4 py-3 text-muted-foreground md:table-cell">
									{file.mimeType ?? '—'}
								</td>
								<td class="hidden px-4 py-3 text-muted-foreground sm:table-cell">
									{formatBytes(file.sizeBytes)}
								</td>
								<td class="hidden px-4 py-3 text-muted-foreground lg:table-cell">
									{new Date(file.createdAt).toLocaleDateString()}
								</td>
								<td class="px-4 py-3">
									<div class="flex items-center justify-end gap-1">
										{#if file.mimeType?.startsWith('image/')}
											<Button
												size="icon-sm"
												variant="ghost"
												onclick={() => openPreview(file)}
												title="Preview"
											>
												<Eye size={15} />
											</Button>
										{/if}
										<Button
											size="icon-sm"
											variant="ghost"
											onclick={() => copyToClipboard(file.cdnUrl)}
											title="Copy CDN link"
										>
											<Copy size={15} />
										</Button>
										<Button
											size="icon-sm"
											variant="ghost"
											href={file.cdnUrl}
											target="_blank"
											rel="noopener noreferrer"
											title="Open in new tab"
										>
											<ExternalLink size={15} />
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<!-- Preview Dialog -->
<Dialog bind:open={isPreviewOpen}>
	<DialogContent class="max-w-3xl overflow-hidden p-0">
		<DialogTitle class="sr-only">{previewFile?.originalName ?? 'Preview'}</DialogTitle>
		<DialogDescription class="sr-only">Image preview</DialogDescription>
		{#if previewFile}
			<img
				src={previewFile.cdnUrl}
				alt={previewFile.originalName}
				class="max-h-[80vh] w-full object-contain"
			/>
			<div class="flex items-center justify-between gap-4 border-t border-border px-4 py-3 text-sm">
				<span class="truncate font-medium">{previewFile.originalName}</span>
				<div class="flex shrink-0 items-center gap-2 text-muted-foreground">
					<span>{formatBytes(previewFile.sizeBytes)}</span>
					<Button
						size="sm"
						variant="secondary"
						onclick={() => copyToClipboard(previewFile!.cdnUrl)}
					>
						<Copy size={14} class="mr-1.5" />
						Copy CDN link
					</Button>
				</div>
			</div>
		{/if}
	</DialogContent>
</Dialog>
