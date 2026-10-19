"""create articles table

Revision ID: 20260903_03_articles
Revises: 20260903_02_discount_percent
Create Date: 2026-09-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20260903_03_articles'
down_revision = '20260903_02_discount_percent'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    tables = inspector.get_table_names()
    if 'articles' not in tables:
        op.create_table(
            'articles',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('slug', sa.String(length=255), nullable=False),
            sa.Column('excerpt', sa.String(length=500), nullable=True),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('cover_image_url', sa.String(length=500), nullable=True),
            sa.Column('author_name', sa.String(length=100), server_default='ConceptStay Team', nullable=False),
            sa.Column('read_time_minutes', sa.Integer(), server_default='3', nullable=False),
            sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
            sa.Column('is_published', sa.Boolean(), server_default='true', nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index('ix_articles_slug', 'articles', ['slug'], unique=True)
        op.create_index('ix_articles_published_created', 'articles', ['is_published', 'created_at'])


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if 'articles' in tables:
        op.drop_table('articles')
