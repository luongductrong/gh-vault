<script lang="ts">
	import { fetchApi, formatBytes } from '$lib/api';
	import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { z } from 'zod';

	const queryClient = useQueryClient();

	const bucketsQuery = createQuery(() => ({
		queryKey: ['buckets'],
		queryFn: async () => {
			const res = await fetchApi<{ data: any[]; total: number }>('/buckets');
			return res.data;
		}
	}));

	let isCreateOpen = $state(false);
	let newDisplayName = $state('');
	let createError = $state('');

	const createSchema = z.object({
		displayName: z.string().min(1, 'Display name is required').max(50, 'Max 50 characters')
	});

	const createMutationFn = createMutation(() => ({
		mutationFn: async (name: string) => {
			return fetchApi('/buckets', {
				method: 'POST',
				body: JSON.stringify({ display_name: name })
			});
		},
		onSuccess: (newBucket: any) => {
			toast.success('Vault created successfully!');
			queryClient.invalidateQueries({ queryKey: ['buckets'] });
			isCreateOpen = false;
			newDisplayName = '';
			// Optionally navigate to the new bucket
			// goto(`/buckets/${newBucket.id}`);
		},
		onError: (error: any) => {
			createError = error.message || 'Failed to create vault';
			toast.error(createError);
		}
	}));

	function handleCreateSubmit(e: Event) {
		e.preventDefault();
		createError = '';

		const result = createSchema.safeParse({ displayName: newDisplayName });
		if (!result.success) {
			createError = result.error.issues[0].message;
			return;
		}

		createMutationFn.mutate(newDisplayName);
	}
</script>

<div class="container mx-auto max-w-5xl p-4 md:p-6 lg:p-8 space-y-8">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Your Vaults</h1>
			<p class="text-muted-foreground mt-1">Manage your CDN storage buckets.</p>
		</div>
		
		<Dialog.Root bind:open={isCreateOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props}>Create New Vault</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content class="sm:max-w-[28rem]">
				<Dialog.Header>
					<Dialog.Title>Create New Vault</Dialog.Title>
					<Dialog.Description>
						This will create a new GitHub repository under your account to store files.
					</Dialog.Description>
				</Dialog.Header>
				
				<form onsubmit={handleCreateSubmit} class="space-y-6 pt-4">
					<div class="space-y-2">
						<Label for="displayName">Display Name</Label>
						<Input 
							id="displayName" 
							placeholder="e.g. Blog Assets" 
							bind:value={newDisplayName}
							disabled={createMutationFn.isPending}
							autocomplete="off"
						/>
						{#if createError}
							<p class="text-sm font-medium text-destructive">{createError}</p>
						{/if}
					</div>
					
					<Dialog.Footer>
						<Button 
							type="button" 
							variant="outline" 
							onclick={() => isCreateOpen = false}
							disabled={createMutationFn.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutationFn.isPending}>
							{#if createMutationFn.isPending}
								Creating...
							{:else}
								Create Vault
							{/if}
						</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	{#if bucketsQuery.isPending}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _}
				<Card.Root>
					<Card.Header class="space-y-2">
						<Skeleton class="h-5 w-1/2" />
						<Skeleton class="h-4 w-3/4" />
					</Card.Header>
					<Card.Content>
						<Skeleton class="h-10 w-full" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if bucketsQuery.isError}
		<Card.Root class="border-destructive/50 bg-destructive/10">
			<Card.Content class="flex flex-col items-center justify-center p-10 text-center">
				<p class="text-destructive font-medium mb-4">Error loading vaults: {bucketsQuery.error.message}</p>
				<Button variant="outline" onclick={() => bucketsQuery.refetch()}>Try Again</Button>
			</Card.Content>
		</Card.Root>
	{:else if bucketsQuery.data?.length === 0}
		<Card.Root class="border-dashed">
			<Card.Content class="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open mb-4 opacity-50"><path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/></svg>
				<h3 class="text-lg font-semibold text-foreground mb-1">No Vaults Found</h3>
				<p class="mb-6 max-w-sm">You haven't created any vaults yet. Create your first vault to start uploading files.</p>
				<Button onclick={() => isCreateOpen = true}>Create New Vault</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each bucketsQuery.data || [] as bucket}
				<Card.Root class="flex flex-col hover:border-primary/50 transition-colors">
					<Card.Header>
						<Card.Title class="truncate" title={bucket.displayName || bucket.githubRepoName}>
							{bucket.displayName || bucket.githubRepoName}
						</Card.Title>
						<Card.Description class="font-mono text-xs truncate">
							{bucket.githubRepoName}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex-1 space-y-4 text-sm">
						<div class="flex justify-between border-b border-border pb-2">
							<span class="text-muted-foreground">Files</span>
							<span class="font-medium">{bucket.fileCount} / {bucket.maxFiles}</span>
						</div>
						<div class="flex justify-between border-b border-border pb-2">
							<span class="text-muted-foreground">Storage</span>
							<span class="font-medium">{formatBytes(bucket.totalSizeBytes)} / {formatBytes(bucket.maxSizeBytes, 0)}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status</span>
							<span class="inline-flex items-center gap-1.5 font-medium {bucket.status === 'full' ? 'text-destructive' : 'text-primary'}">
								<span class="h-2 w-2 rounded-full {bucket.status === 'full' ? 'bg-destructive' : 'bg-primary'}"></span>
								{bucket.status === 'full' ? 'Full' : 'Available'}
							</span>
						</div>
					</Card.Content>
					<Card.Footer>
						<Button variant="secondary" class="w-full" onclick={() => goto(`/buckets/${bucket.id}`)}>
							Open Vault
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
