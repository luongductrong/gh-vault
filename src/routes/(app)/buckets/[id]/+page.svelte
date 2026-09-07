<script lang="ts">
	import { cn } from '$lib/utils.js';
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
		ListFilter
	} from '@lucide/svelte';

	import { page } from '$app/state';
	import { fetchApi, formatBytes } from '$lib/api';
	import { createQuery, createInfiniteQuery } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Dialog, DialogContent, DialogTitle, DialogDescription } from '$lib/components/ui/dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import type { Bucket, FileItem } from '$lib/types';
	import UploadDialog from '$lib/components/UploadDialog.svelte';

	const bucketId = $derived(page.params.id as string);

	let searchQuery = $state('');
	let debouncedSearch = $state('');
	let sortBy = $state('createdAt');
	let sortOrder = $state('desc');

	$effect(() => {
		const q = searchQuery.trim();
		const handler = setTimeout(() => {
			debouncedSearch = q.length > 2 ? q : '';
		}, 300);
		return () => clearTimeout(handler);
	});

	// Fetch bucket info
	const bucketQuery = createQuery(() => ({
		queryKey: ['buckets', bucketId],
		queryFn: () => fetchApi<Bucket>(`/buckets/${bucketId}`)
	}));

	// Fetch files
	const filesQuery = createInfiniteQuery(() => ({
		queryKey: ['buckets', bucketId, 'files', debouncedSearch, sortBy, sortOrder],
		queryFn: ({ pageParam = 0 }) =>
			fetchApi<{ data: FileItem[]; hasNextPage: boolean; nextOffset: number }>(
				`/buckets/${bucketId}/files?offset=${pageParam}&limit=30&search=${encodeURIComponent(debouncedSearch)}&sortBy=${sortBy}&sortOrder=${sortOrder}`
			),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.nextOffset : undefined)
	}));

	const uniqueFiles = $derived.by(() => {
		if (!filesQuery.data) return [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const map = new Map<string, FileItem>();
		for (const page of filesQuery.data.pages) {
			for (const file of page.data) {
				if (!map.has(file.id)) {
					map.set(file.id, file);
				}
			}
		}
		return Array.from(map.values());
	});

	let previewFile = $state<FileItem | null>(null);
	let isPreviewOpen = $state(false);

	function copyToClipboard(text: string) {
		if (!text) return;
		navigator.clipboard.writeText(text).then(() => {
			toast.success('Copied to clipboard');
		});
	}

	function openPreview(file: FileItem) {
		if (!file.cdnUrl) return;
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
					<h1 class="text-xl font-bold tracking-tight sm:text-2xl md:text-3xl">
						{b.displayName || (b.provider === 'github' ? b.githubRepoName : 'Cloudflare R2')}
					</h1>
				</div>
				<div class="ml-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
					{#if b.provider === 'github'}
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
							{formatBytes(b.totalSizeBytes ?? 0)} / {formatBytes(b.maxSizeBytes ?? 0, 0)}
						</span>
					{:else}
						<span class="flex items-center gap-1.5">
							<HardDrive size={16} />
							Cloudflare R2 · {b.r2BucketName}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex items-center">
				<UploadDialog bucket={b} />
			</div>
		</div>
	{/if}

	<!-- File List -->
	<div class="pt-2">
		<div class="mb-4 flex flex-row items-center justify-end gap-4 sm:justify-between">
			<h2 class="hidden text-xl font-semibold tracking-tight sm:inline-block">Files</h2>
			<div class="flex items-center gap-2">
				<div class="w-full max-w-xs sm:w-64">
					<Input placeholder="Search files..." bind:value={searchQuery} />
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger>
						{#snippet child({ props })}
							<Button variant="outline" size="icon" {...props} title="Sort Options">
								<ListFilter size={16} />
							</Button>
						{/snippet}
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Sort By</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup bind:value={sortBy}>
							<DropdownMenuRadioItem value="createdAt">Date Created</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="sizeBytes">File Size</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>Order</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup bind:value={sortOrder}>
							<DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
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
		{:else if uniqueFiles.length === 0}
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
						{#each uniqueFiles as file (file.id)}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										{#if file.mimeType?.startsWith('image/') && file.cdnUrl}
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
										{#if file.mimeType?.startsWith('image/') && file.cdnUrl}
											<Button
												size="icon-sm"
												variant="ghost"
												onclick={() => openPreview(file)}
												title="Preview"
											>
												<Eye size={15} />
											</Button>
										{/if}
										{#if file.cdnUrl}
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
										{:else if file.provider === 'r2'}
											<span
												class="px-2 text-xs text-muted-foreground"
												title="Configure R2_PUBLIC_BASE_URL to enable public links"
											>
												No public URL
											</span>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if filesQuery.hasNextPage}
				<div class="mt-4 flex justify-center pb-4">
					<Button
						variant="outline"
						onclick={() => filesQuery.fetchNextPage()}
						disabled={filesQuery.isFetchingNextPage}
					>
						{#if filesQuery.isFetchingNextPage}
							<LoaderCircle size={16} class="mr-2 animate-spin" />
							Loading...
						{:else}
							Load More
						{/if}
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Preview Dialog -->
<Dialog bind:open={isPreviewOpen}>
	<DialogContent
		class={cn(
			'flex items-center justify-center overflow-hidden p-4',
			'h-dvh max-h-dvh w-dvw max-w-dvw rounded-none',
			'sm:h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1rem)] sm:w-[calc(100dvw-1rem)] sm:max-w-[calc(100dvw-1rem)] sm:rounded-3xl',
			'md:h-[calc(100dvh-2rem)] md:max-h-[calc(100dvh-2rem)] md:w-[calc(100dvw-2rem)] md:max-w-[calc(100dvw-2rem)]'
		)}
	>
		<DialogTitle class="sr-only">{previewFile?.originalName ?? 'Preview'}</DialogTitle>
		<DialogDescription class="sr-only">Image preview</DialogDescription>
		{#if previewFile?.cdnUrl}
			<img
				src={previewFile.cdnUrl}
				alt={previewFile.originalName}
				class="block h-auto max-h-full w-auto max-w-full object-contain"
			/>
		{:else}
			<p class="text-muted-foreground">No preview available.</p>
		{/if}
	</DialogContent>
</Dialog>
