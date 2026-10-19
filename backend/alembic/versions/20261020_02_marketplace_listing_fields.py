"""marketplace listing fields on properties

Revision ID: 20261020_02_listing_fields
Revises: 20261020_01_host_role
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261020_02_listing_fields'
down_revision = '20261020_01_host_role'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('properties', sa.Column('property_type', sa.String(30), server_default='villa', nullable=False))
    op.add_column('properties', sa.Column('categories', postgresql.JSONB(), server_default='[]', nullable=False))
    op.add_column('properties', sa.Column('experience_tags', postgresql.JSONB(), server_default='[]', nullable=False))
    op.add_column('properties', sa.Column('number_of_rooms', sa.Integer(), server_default='1', nullable=False))
    for col in ('about_stay', 'the_space', 'location_notes', 'what_guests_love', 'things_to_know'):
        op.add_column('properties', sa.Column(col, sa.Text(), server_default='', nullable=False))
    op.add_column('properties', sa.Column('cancellation_policy', sa.String(20), server_default='flexible', nullable=False))
    # Existing listings were curated by the operator: keep them live and approved.
    op.add_column('properties', sa.Column('approval_status', sa.String(20), server_default='approved', nullable=False))
    op.add_column('properties', sa.Column('pending_changes', postgresql.JSONB(), nullable=True))
    op.add_column('properties', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('properties', sa.Column('verification_status', sa.String(20), server_default='unverified', nullable=False))
    op.add_column('properties', sa.Column('verified_at', sa.DateTime(), nullable=True))
    op.create_index('ix_properties_property_type', 'properties', ['property_type'])


def downgrade() -> None:
    op.drop_index('ix_properties_property_type', table_name='properties')
    for col in ('verified_at', 'verification_status', 'rejection_reason', 'pending_changes', 'approval_status',
                'cancellation_policy', 'things_to_know', 'what_guests_love', 'location_notes', 'the_space',
                'about_stay', 'number_of_rooms', 'experience_tags', 'categories', 'property_type'):
        op.drop_column('properties', col)
